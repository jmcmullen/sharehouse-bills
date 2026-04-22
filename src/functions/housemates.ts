import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../api/db";
import { bills } from "../api/db/schema/bills";
import { debts } from "../api/db/schema/debts";
import { housemates } from "../api/db/schema/housemates";
import { getRemainingDebtAmount } from "../api/services/debt-payment-state";
import { normalizeWhatsappNumber } from "../api/services/whatsapp-phone";
import { authMiddleware } from "../lib/auth-middleware";
import { entityIdSchema } from "../lib/id";

interface HousemateBalanceRow {
	id: string;
	name: string;
	isActive: boolean;
	amount: number;
}

// Get all housemates
export const getAllHousemates = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async () => {
		return await db
			.select()
			.from(housemates)
			.orderBy(desc(housemates.createdAt));
	});

// Get outstanding debt totals for each housemate
export const getHousemateOutstandingBalances = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async () => {
		const rows = await db
			.select({
				id: housemates.id,
				name: housemates.name,
				isActive: housemates.isActive,
				creditBalance: housemates.creditBalance,
				debt: debts,
			})
			.from(housemates)
			.leftJoin(debts, eq(debts.housemateId, housemates.id))
			.orderBy(housemates.name);

		const balances = Array.from(
			rows
				.reduce(
					(map, row) => {
						const existing = map.get(row.id) ?? {
							id: row.id,
							name: row.name,
							isActive: row.isActive,
							amount: 0,
							creditBalance: row.creditBalance,
						};

						if (row.debt) {
							existing.amount += getRemainingDebtAmount(row.debt);
						}

						map.set(row.id, existing);
						return map;
					},
					new Map<
						string,
						{
							id: string;
							name: string;
							isActive: boolean;
							amount: number;
							creditBalance: number;
						}
					>(),
				)
				.values(),
		).map((row) => ({
			id: row.id,
			name: row.name,
			isActive: row.isActive,
			amount: Math.max(0, row.amount - row.creditBalance),
		}));

		return balances.sort((left, right) => {
			return right.amount - left.amount || left.name.localeCompare(right.name);
		});
	});

// Get overdue debt totals for each housemate
export const getHousemateOverdueBalances = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async () => {
		const now = new Date();
		const rows = await db
			.select({
				id: housemates.id,
				name: housemates.name,
				isActive: housemates.isActive,
				debt: debts,
				billDueDate: bills.dueDate,
			})
			.from(housemates)
			.leftJoin(debts, eq(debts.housemateId, housemates.id))
			.leftJoin(bills, eq(debts.billId, bills.id))
			.orderBy(housemates.name);

		const balances = Array.from(
			rows
				.reduce((map, row) => {
					const existing = map.get(row.id) ?? {
						id: row.id,
						name: row.name,
						isActive: row.isActive,
						amount: 0,
					};

					if (row.debt && row.billDueDate && row.billDueDate < now) {
						existing.amount += getRemainingDebtAmount(row.debt);
					}

					map.set(row.id, existing);
					return map;
				}, new Map<string, HousemateBalanceRow>())
				.values(),
		);

		return balances.sort((left, right) => {
			return right.amount - left.amount || left.name.localeCompare(right.name);
		});
	});

// Get active housemates only
export const getActiveHousemates = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async () => {
		return await db
			.select()
			.from(housemates)
			.where(eq(housemates.isActive, true))
			.orderBy(housemates.name);
	});

// Get a specific housemate by ID
export const getHousemateById = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ id: entityIdSchema }))
	.handler(async ({ data }) => {
		const [housemate] = await db
			.select()
			.from(housemates)
			.where(eq(housemates.id, data.id));

		if (!housemate) {
			throw new Error("Housemate not found");
		}

		return housemate;
	});

// Create a new housemate
export const createHousemate = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			name: z.string().min(1),
			email: z.string().email().optional(),
			whatsappNumber: z.string().optional(),
			bankAlias: z.string().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const [newHousemate] = await db
			.insert(housemates)
			.values({
				name: data.name,
				email: data.email,
				whatsappNumber: normalizeWhatsappNumber(data.whatsappNumber),
				bankAlias: data.bankAlias,
				isActive: true,
				isOwner: false,
			})
			.returning();

		return newHousemate;
	});

// Update a housemate
export const updateHousemate = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			id: entityIdSchema,
			name: z.string().min(1).optional(),
			email: z.string().email().optional(),
			whatsappNumber: z.string().optional(),
			bankAlias: z.string().optional(),
			isActive: z.boolean().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const { id, ...updateData } = data;
		const shouldUpdateWhatsappNumber = Object.hasOwn(data, "whatsappNumber");

		const [updatedHousemate] = await db
			.update(housemates)
			.set({
				...updateData,
				...(shouldUpdateWhatsappNumber
					? {
							whatsappNumber: normalizeWhatsappNumber(data.whatsappNumber),
						}
					: {}),
				updatedAt: new Date(),
			})
			.where(eq(housemates.id, id))
			.returning();

		if (!updatedHousemate) {
			throw new Error("Housemate not found");
		}

		return updatedHousemate;
	});

// Get housemate's debt history
export const getHousemateDebts = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ housemateId: entityIdSchema }))
	.handler(async ({ data }) => {
		return await db
			.select({
				debt: debts,
				bill: bills,
			})
			.from(debts)
			.innerJoin(bills, eq(debts.billId, bills.id))
			.where(eq(debts.housemateId, data.housemateId))
			.orderBy(desc(bills.createdAt));
	});

// Get housemate's outstanding debts
export const getHousemateOutstandingDebts = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ housemateId: entityIdSchema }))
	.handler(async ({ data }) => {
		return await db
			.select({
				debt: debts,
				bill: bills,
			})
			.from(debts)
			.innerJoin(bills, eq(debts.billId, bills.id))
			.where(
				and(eq(debts.housemateId, data.housemateId), eq(debts.isPaid, false)),
			)
			.orderBy(desc(bills.dueDate));
	});

// Get housemate payment statistics
export const getHousemateStats = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ housemateId: entityIdSchema }))
	.handler(async ({ data }) => {
		const allDebts = await db
			.select()
			.from(debts)
			.where(eq(debts.housemateId, data.housemateId));

		const paidDebts = allDebts.filter((debt) => debt.isPaid);
		const unpaidDebts = allDebts.filter((debt) => !debt.isPaid);
		const [housemate] = await db
			.select({ creditBalance: housemates.creditBalance })
			.from(housemates)
			.where(eq(housemates.id, data.housemateId))
			.limit(1);

		const totalOwed = allDebts.reduce((sum, debt) => sum + debt.amountOwed, 0);
		const totalPaid = allDebts.reduce((sum, debt) => sum + debt.amountPaid, 0);
		const totalOutstanding = Math.max(
			0,
			unpaidDebts.reduce((sum, debt) => {
				return sum + getRemainingDebtAmount(debt);
			}, 0) - (housemate?.creditBalance ?? 0),
		);

		return {
			totalDebts: allDebts.length,
			paidDebts: paidDebts.length,
			unpaidDebts: unpaidDebts.length,
			totalOwed,
			totalPaid,
			totalOutstanding,
			paymentRate: allDebts.length > 0 ? paidDebts.length / allDebts.length : 0,
		};
	});

// Deactivate a housemate (soft delete)
export const deactivateHousemate = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ id: entityIdSchema }))
	.handler(async ({ data }) => {
		const [updatedHousemate] = await db
			.update(housemates)
			.set({
				isActive: false,
				updatedAt: new Date(),
			})
			.where(eq(housemates.id, data.id))
			.returning();

		if (!updatedHousemate) {
			throw new Error("Housemate not found");
		}

		return updatedHousemate;
	});

// Reactivate a housemate
export const reactivateHousemate = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ id: entityIdSchema }))
	.handler(async ({ data }) => {
		const [updatedHousemate] = await db
			.update(housemates)
			.set({
				isActive: true,
				updatedAt: new Date(),
			})
			.where(eq(housemates.id, data.id))
			.returning();

		if (!updatedHousemate) {
			throw new Error("Housemate not found");
		}

		return updatedHousemate;
	});
