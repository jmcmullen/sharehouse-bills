import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../api/db";
import { bills } from "../api/db/schema/bills";
import { debts } from "../api/db/schema/debts";
import { housemates } from "../api/db/schema/housemates";
import { generateWeeklyRentBill } from "../api/services/recurring-bill";
import { authMiddleware } from "../lib/auth-middleware";

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
			.orderBy(bills.dueDate);
	});

// Get a specific bill with its debts
export const getBillById = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(z.object({ id: z.number() }))
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
	.validator(
		z.object({
			billerName: z.string().min(1),
			totalAmount: z.number().positive(),
			dueDate: z.date(),
			pdfUrl: z.string().url().optional(),
		}),
	)
	.handler(async ({ data }) => {
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
			throw new Error("No active housemates found");
		}

		// Split the bill equally among active housemates
		const amountPerPerson = data.totalAmount / activeHousemates.length;

		// Create debt records for each housemate
		const debtRecords = activeHousemates.map((housemate) => ({
			billId: newBill.id,
			housemateId: housemate.id,
			amountOwed: amountPerPerson,
			isPaid: false,
		}));

		await db.insert(debts).values(debtRecords);

		return newBill;
	});

// Create a bill from parsed PDF data (for webhook integration)
export const createBillFromParsedData = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(
		z.object({
			billerName: z.string().min(1),
			totalAmount: z.number().positive(),
			dueDate: z.date(),
			pdfUrl: z.string().url().optional(),
		}),
	)
	.handler(async ({ data }) => {
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
			throw new Error("No active housemates found");
		}

		const amountPerPerson = data.totalAmount / activeHousemates.length;

		const debtRecords = activeHousemates.map((housemate) => ({
			billId: newBill.id,
			housemateId: housemate.id,
			amountOwed: amountPerPerson,
			isPaid: false,
		}));

		await db.insert(debts).values(debtRecords);

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
	.validator(z.object({ billId: z.number() }))
	.handler(async ({ data }) => {
		// First delete all associated debts
		await db.delete(debts).where(eq(debts.billId, data.billId));

		// Then delete the bill
		await db.delete(bills).where(eq(bills.id, data.billId));

		return { success: true };
	});

// Mark a debt as paid or unpaid
export const markDebtPaid = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(
		z.object({
			debtId: z.number(),
			isPaid: z.boolean(),
		}),
	)
	.handler(async ({ data }) => {
		const [updatedDebt] = await db
			.update(debts)
			.set({ isPaid: data.isPaid })
			.where(eq(debts.id, data.debtId))
			.returning();

		return updatedDebt;
	});

// Get bills for a specific housemate
export const getBillsForHousemate = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(z.object({ housemateId: z.number() }))
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
	.validator(z.object({ housemateId: z.number() }))
	.handler(async ({ data }) => {
		const debtsInfo = await db
			.select({
				debt: debts,
			})
			.from(debts)
			.where(
				and(eq(debts.housemateId, data.housemateId), eq(debts.isPaid, false)),
			);

		const totalOwed = debtsInfo.reduce(
			(sum, { debt }) => sum + debt.amountOwed,
			0,
		);

		return { totalOwed, unpaidCount: debtsInfo.length };
	});

// Generate weekly rent bill
export const generateWeeklyRent = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.handler(async () => {
		const billId = await generateWeeklyRentBill();
		if (!billId) {
			throw new Error("Failed to generate weekly rent bill");
		}

		return { success: true, billId };
	});
