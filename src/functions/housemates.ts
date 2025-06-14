import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../api/db";
import { bills } from "../api/db/schema/bills";
import { debts } from "../api/db/schema/debts";
import { housemates } from "../api/db/schema/housemates";
import { authMiddleware } from "../lib/auth-middleware";

// Get all housemates
export const getAllHousemates = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async () => {
		return await db
			.select()
			.from(housemates)
			.orderBy(desc(housemates.createdAt));
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
	.validator(z.object({ id: z.number() }))
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
	.validator(
		z.object({
			name: z.string().min(1),
			email: z.string().email().optional(),
			bankAlias: z.string().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const [newHousemate] = await db
			.insert(housemates)
			.values({
				name: data.name,
				email: data.email,
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
	.validator(
		z.object({
			id: z.number(),
			name: z.string().min(1).optional(),
			email: z.string().email().optional(),
			bankAlias: z.string().optional(),
			isActive: z.boolean().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const { id, ...updateData } = data;

		const [updatedHousemate] = await db
			.update(housemates)
			.set({
				...updateData,
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
	.validator(z.object({ housemateId: z.number() }))
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
	.validator(z.object({ housemateId: z.number() }))
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
	.validator(z.object({ housemateId: z.number() }))
	.handler(async ({ data }) => {
		const allDebts = await db
			.select()
			.from(debts)
			.where(eq(debts.housemateId, data.housemateId));

		const paidDebts = allDebts.filter((debt) => debt.isPaid);
		const unpaidDebts = allDebts.filter((debt) => !debt.isPaid);

		const totalOwed = allDebts.reduce((sum, debt) => sum + debt.amountOwed, 0);
		const totalPaid = paidDebts.reduce((sum, debt) => sum + debt.amountOwed, 0);
		const totalOutstanding = unpaidDebts.reduce(
			(sum, debt) => sum + debt.amountOwed,
			0,
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
	.validator(z.object({ id: z.number() }))
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
	.validator(z.object({ id: z.number() }))
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
