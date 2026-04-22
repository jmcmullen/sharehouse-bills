import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq } from "drizzle-orm";
import { createError } from "evlog";
import { z } from "zod";
import { db } from "../api/db";
import { bills } from "../api/db/schema/bills";
import { debts } from "../api/db/schema/debts";
import { housemates } from "../api/db/schema/housemates";
import {
	applyHousemateCreditToDebt,
	getRemainingDebtAmount,
	updateBillStatusFromDebts,
} from "../api/services/debt-payment-state";
import { generateWeeklyRentBill } from "../api/services/recurring-bill";
import { authMiddleware } from "../lib/auth-middleware";
import { getRequestLogger } from "../lib/request-logger";

// Get all bills with their associated debts and housemate info
export const getAllBills = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async () => {
		return await db
			.select({
				bill: bills,
				debt: debts,
				housemate: housemates,
			})
			.from(bills)
			.leftJoin(debts, eq(bills.id, debts.billId))
			.leftJoin(housemates, eq(debts.housemateId, housemates.id))
			.orderBy(desc(bills.dueDate));
	});

// Get a specific bill with its debts
export const getBillById = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ id: z.number() }))
	.handler(async ({ data }) => {
		return await db
			.select({
				bill: bills,
				debt: debts,
				housemate: housemates,
			})
			.from(bills)
			.leftJoin(debts, eq(bills.id, debts.billId))
			.leftJoin(housemates, eq(debts.housemateId, housemates.id))
			.where(eq(bills.id, data.id));
	});

// Create a new bill manually
export const createBill = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			billerName: z.string().min(1),
			totalAmount: z.number().positive(),
			dueDate: z.date(),
			pdfUrl: z.string().url().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const log = getRequestLogger();
		log?.set({
			bill: {
				billerName: data.billerName,
				totalAmount: data.totalAmount,
				dueDate: data.dueDate.toISOString(),
				source: "manual",
			},
		});
		const [newBill] = await db
			.insert(bills)
			.values({
				billerName: data.billerName,
				totalAmount: data.totalAmount,
				dueDate: data.dueDate,
				pdfUrl: data.pdfUrl,
			})
			.returning();

		// Get all active housemates to create debts
		const activeHousemates = await db
			.select()
			.from(housemates)
			.where(eq(housemates.isActive, true));

		if (activeHousemates.length === 0) {
			throw createError({
				message: "No active housemates found",
				status: 500,
				why: "A bill cannot be split because there are no active housemates.",
				fix: "Add or reactivate at least one housemate before creating a bill.",
			});
		}

		// Split the bill equally among active housemates
		const amountPerPerson = data.totalAmount / activeHousemates.length;

		// Create debt records for each housemate
		const debtRecords = activeHousemates.map((housemate) => ({
			billId: newBill.id,
			housemateId: housemate.id,
			amountOwed: amountPerPerson,
			amountPaid: 0,
			isPaid: false,
		}));

		const insertedDebts = await db.insert(debts).values(debtRecords).returning({
			id: debts.id,
			housemateId: debts.housemateId,
		});
		for (const debtRecord of insertedDebts) {
			await applyHousemateCreditToDebt(debtRecord.housemateId, debtRecord.id);
		}
		log?.set({
			bill: {
				id: newBill.id,
				billerName: data.billerName,
				totalAmount: data.totalAmount,
				dueDate: data.dueDate.toISOString(),
				source: "manual",
			},
			debts: {
				recordCount: debtRecords.length,
				amountPerPerson,
			},
		});

		return newBill;
	});

// Create a bill from parsed PDF data (for webhook integration)
export const createBillFromParsedData = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			billerName: z.string().min(1),
			totalAmount: z.number().positive(),
			dueDate: z.date(),
			pdfUrl: z.string().url().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const log = getRequestLogger();
		log?.set({
			bill: {
				billerName: data.billerName,
				totalAmount: data.totalAmount,
				dueDate: data.dueDate.toISOString(),
				source: "parsed",
			},
		});
		// Same logic as createBill but specifically for webhook usage
		const [newBill] = await db
			.insert(bills)
			.values({
				billerName: data.billerName,
				totalAmount: data.totalAmount,
				dueDate: data.dueDate,
				pdfUrl: data.pdfUrl,
			})
			.returning();

		const activeHousemates = await db
			.select()
			.from(housemates)
			.where(eq(housemates.isActive, true));

		if (activeHousemates.length === 0) {
			throw createError({
				message: "No active housemates found",
				status: 500,
				why: "A parsed bill cannot be split because there are no active housemates.",
				fix: "Add or reactivate at least one housemate before importing bills.",
			});
		}

		const amountPerPerson = data.totalAmount / activeHousemates.length;

		const debtRecords = activeHousemates.map((housemate) => ({
			billId: newBill.id,
			housemateId: housemate.id,
			amountOwed: amountPerPerson,
			amountPaid: 0,
			isPaid: false,
		}));

		const insertedDebts = await db.insert(debts).values(debtRecords).returning({
			id: debts.id,
			housemateId: debts.housemateId,
		});
		for (const debtRecord of insertedDebts) {
			await applyHousemateCreditToDebt(debtRecord.housemateId, debtRecord.id);
		}
		log?.set({
			bill: {
				id: newBill.id,
				billerName: data.billerName,
				totalAmount: data.totalAmount,
				dueDate: data.dueDate.toISOString(),
				source: "parsed",
			},
			debts: {
				recordCount: debtRecords.length,
				amountPerPerson,
			},
		});

		// Return bill with debt information for notification purposes
		const billWithDebts = await db
			.select({
				bill: bills,
				debt: debts,
				housemate: housemates,
			})
			.from(bills)
			.leftJoin(debts, eq(bills.id, debts.billId))
			.leftJoin(housemates, eq(debts.housemateId, housemates.id))
			.where(eq(bills.id, newBill.id));

		return billWithDebts;
	});

// Delete a bill and all associated debts
export const deleteBill = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ billId: z.number() }))
	.handler(async ({ data }) => {
		const log = getRequestLogger();
		log?.set({
			bill: {
				id: data.billId,
			},
		});
		// First delete all associated debts
		await db.delete(debts).where(eq(debts.billId, data.billId));

		// Then delete the bill
		await db.delete(bills).where(eq(bills.id, data.billId));
		log?.set({
			bill: {
				id: data.billId,
				deleted: true,
			},
		});

		return { success: true };
	});

// Mark a debt as paid or unpaid
export const markDebtPaid = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			debtId: z.number(),
			amountPaid: z.number().min(0),
		}),
	)
	.handler(async ({ data }) => {
		const log = getRequestLogger();
		log?.set({
			debt: {
				id: data.debtId,
				amountPaid: data.amountPaid,
			},
		});
		const now = new Date();
		const [existingDebt] = await db
			.select()
			.from(debts)
			.where(eq(debts.id, data.debtId))
			.limit(1);

		if (!existingDebt) {
			throw createError({
				message: "Debt not found",
				status: 404,
				why: `No debt exists with id ${data.debtId}.`,
				fix: "Refresh the page and retry with a valid debt.",
			});
		}

		const normalizedAmountPaid = Math.min(
			existingDebt.amountOwed,
			Math.max(0, data.amountPaid),
		);
		const isPaid =
			getRemainingDebtAmount({
				amountOwed: existingDebt.amountOwed,
				amountPaid: normalizedAmountPaid,
			}) <= 0.009;
		const [updatedDebt] = await db
			.update(debts)
			.set({
				amountPaid: isPaid ? existingDebt.amountOwed : normalizedAmountPaid,
				isPaid,
				paidAt: isPaid ? now : null,
				updatedAt: now,
			})
			.where(eq(debts.id, data.debtId))
			.returning();

		if (updatedDebt) {
			await updateBillStatusFromDebts(updatedDebt.billId);
			log?.set({
				debt: {
					id: updatedDebt.id,
					billId: updatedDebt.billId,
					amountPaid: updatedDebt.amountPaid,
					isPaid: updatedDebt.isPaid,
					paidAt: updatedDebt.paidAt?.toISOString() ?? null,
				},
			});
		}

		return updatedDebt;
	});

// Get bills for a specific housemate
export const getBillsForHousemate = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ housemateId: z.number() }))
	.handler(async ({ data }) => {
		const housemateBills = await db
			.select({
				bill: bills,
				debt: debts,
				housemate: housemates,
			})
			.from(debts)
			.innerJoin(bills, eq(debts.billId, bills.id))
			.innerJoin(housemates, eq(debts.housemateId, housemates.id))
			.where(eq(debts.housemateId, data.housemateId))
			.orderBy(desc(bills.dueDate));

		return housemateBills;
	});

// Get total owed by a housemate
export const getTotalOwedByHousemate = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ housemateId: z.number() }))
	.handler(async ({ data }) => {
		const debtsInfo = await db
			.select({
				debt: debts,
			})
			.from(debts)
			.where(
				and(eq(debts.housemateId, data.housemateId), eq(debts.isPaid, false)),
			);

		const [housemate] = await db
			.select({ creditBalance: housemates.creditBalance })
			.from(housemates)
			.where(eq(housemates.id, data.housemateId))
			.limit(1);
		const totalOwed = Math.max(
			0,
			debtsInfo.reduce((sum, { debt }) => {
				return sum + getRemainingDebtAmount(debt);
			}, 0) - (housemate?.creditBalance ?? 0),
		);

		return { totalOwed, unpaidCount: debtsInfo.length };
	});

// Generate weekly rent bill
export const generateWeeklyRent = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.handler(async () => {
		const log = getRequestLogger();
		log?.set({
			recurringBillGeneration: {
				templateName: "Weekly Rent",
			},
		});
		const billId = await generateWeeklyRentBill();
		if (!billId) {
			throw createError({
				message: "Failed to generate weekly rent bill",
				status: 500,
				why: "The Weekly Rent template did not produce a new bill.",
				fix: "Inspect recurring bill configuration and the recurring bill generation wide event.",
			});
		}
		log?.set({
			recurringBillGeneration: {
				templateName: "Weekly Rent",
				billId,
			},
		});

		return { success: true, billId };
	});
