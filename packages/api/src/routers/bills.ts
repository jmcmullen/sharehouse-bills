import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { bills } from "../db/schema/bills";
import { debts } from "../db/schema/debts";
import { housemates } from "../db/schema/housemates";
import { protectedProcedure, publicProcedure } from "../lib/orpc";

export const billsRouter = {
	// Get all bills with their associated debts and housemate info
	getAllBills: protectedProcedure.handler(async () => {
		return await db
			.select({
				bill: bills,
				debt: debts,
				housemate: housemates,
			})
			.from(bills)
			.leftJoin(debts, eq(bills.id, debts.billId))
			.leftJoin(housemates, eq(debts.housemateId, housemates.id))
			.orderBy(desc(bills.createdAt));
	}),

	// Get a specific bill with its debts
	getBillById: protectedProcedure
		.input(z.object({ id: z.number() }))
		.handler(async ({ input }) => {
			return await db
				.select({
					bill: bills,
					debt: debts,
					housemate: housemates,
				})
				.from(bills)
				.leftJoin(debts, eq(bills.id, debts.billId))
				.leftJoin(housemates, eq(debts.housemateId, housemates.id))
				.where(eq(bills.id, input.id));
		}),

	// Create a new bill manually
	createBill: protectedProcedure
		.input(
			z.object({
				billerName: z.string().min(1),
				totalAmount: z.number().positive(),
				dueDate: z.date(),
				pdfUrl: z.string().url().optional(),
			}),
		)
		.handler(async ({ input }) => {
			const [newBill] = await db
				.insert(bills)
				.values({
					billerName: input.billerName,
					totalAmount: input.totalAmount,
					dueDate: input.dueDate,
					pdfUrl: input.pdfUrl,
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
			const amountPerPerson = input.totalAmount / activeHousemates.length;

			// Create debt records for each housemate
			const debtRecords = activeHousemates.map((housemate) => ({
				billId: newBill.id,
				housemateId: housemate.id,
				amountOwed: amountPerPerson,
			}));

			await db.insert(debts).values(debtRecords);

			return newBill;
		}),

	// Create a bill from parsed PDF data (for webhook integration)
	createBillFromParsedData: protectedProcedure
		.input(
			z.object({
				billerName: z.string().min(1),
				totalAmount: z.number().positive(),
				dueDate: z.date(),
				pdfUrl: z.string().url().optional(),
			}),
		)
		.handler(async ({ input }) => {
			// Same logic as createBill but specifically for webhook usage
			const [newBill] = await db
				.insert(bills)
				.values({
					billerName: input.billerName,
					totalAmount: input.totalAmount,
					dueDate: input.dueDate,
					pdfUrl: input.pdfUrl,
				})
				.returning();

			const activeHousemates = await db
				.select()
				.from(housemates)
				.where(eq(housemates.isActive, true));

			if (activeHousemates.length === 0) {
				throw new Error("No active housemates found");
			}

			const amountPerPerson = input.totalAmount / activeHousemates.length;

			const debtRecords = activeHousemates.map((housemate) => ({
				billId: newBill.id,
				housemateId: housemate.id,
				amountOwed: amountPerPerson,
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
		}),

	// Mark a specific debt as paid
	markDebtAsPaid: protectedProcedure
		.input(z.object({ debtId: z.number() }))
		.handler(async ({ input }) => {
			// Update the debt record
			const [updatedDebt] = await db
				.update(debts)
				.set({
					isPaid: true,
					paidAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(debts.id, input.debtId))
				.returning();

			if (!updatedDebt) {
				throw new Error("Debt not found");
			}

			// Check if all debts for this bill are now paid
			const remainingDebts = await db
				.select()
				.from(debts)
				.where(
					and(eq(debts.billId, updatedDebt.billId), eq(debts.isPaid, false)),
				);

			// Update bill status based on payment completion
			const newStatus = remainingDebts.length === 0 ? "paid" : "partially_paid";

			await db
				.update(bills)
				.set({
					status: newStatus,
					updatedAt: new Date(),
				})
				.where(eq(bills.id, updatedDebt.billId));

			return {
				success: true,
				debtId: updatedDebt.id,
				billStatus: newStatus,
			};
		}),

	// Get bills summary/statistics
	getBillsSummary: protectedProcedure.handler(async () => {
		const totalBills = await db.select().from(bills);
		const paidBills = totalBills.filter((bill) => bill.status === "paid");
		const pendingBills = totalBills.filter((bill) => bill.status === "pending");
		const partiallyPaidBills = totalBills.filter(
			(bill) => bill.status === "partially_paid",
		);

		const totalAmount = totalBills.reduce(
			(sum, bill) => sum + bill.totalAmount,
			0,
		);
		const paidAmount = paidBills.reduce(
			(sum, bill) => sum + bill.totalAmount,
			0,
		);

		return {
			totalBills: totalBills.length,
			paidBills: paidBills.length,
			pendingBills: pendingBills.length,
			partiallyPaidBills: partiallyPaidBills.length,
			totalAmount,
			paidAmount,
			outstandingAmount: totalAmount - paidAmount,
		};
	}),
};
