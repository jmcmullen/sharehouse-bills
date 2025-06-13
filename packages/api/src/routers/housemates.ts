import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { bills } from "../db/schema/bills";
import { debts } from "../db/schema/debts";
import { housemates } from "../db/schema/housemates";
import { protectedProcedure } from "../lib/orpc";

export const housematesRouter = {
	// Get all housemates
	getAllHousemates: protectedProcedure.handler(async () => {
		return await db
			.select()
			.from(housemates)
			.orderBy(desc(housemates.createdAt));
	}),

	// Get active housemates only
	getActiveHousemates: protectedProcedure.handler(async () => {
		return await db
			.select()
			.from(housemates)
			.where(eq(housemates.isActive, true))
			.orderBy(housemates.name);
	}),

	// Get a specific housemate by ID
	getHousemateById: protectedProcedure
		.input(z.object({ id: z.number() }))
		.handler(async ({ input }) => {
			const [housemate] = await db
				.select()
				.from(housemates)
				.where(eq(housemates.id, input.id));

			if (!housemate) {
				throw new Error("Housemate not found");
			}

			return housemate;
		}),

	// Create a new housemate
	createHousemate: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1),
				email: z.string().email().optional(),
				bankAlias: z.string().optional(),
			}),
		)
		.handler(async ({ input }) => {
			const [newHousemate] = await db
				.insert(housemates)
				.values({
					name: input.name,
					email: input.email,
					bankAlias: input.bankAlias,
				})
				.returning();

			return newHousemate;
		}),

	// Update a housemate
	updateHousemate: protectedProcedure
		.input(
			z.object({
				id: z.number(),
				name: z.string().min(1).optional(),
				email: z.string().email().optional(),
				bankAlias: z.string().optional(),
				isActive: z.boolean().optional(),
			}),
		)
		.handler(async ({ input }) => {
			const { id, ...updateData } = input;

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
		}),

	// Get housemate's debt history
	getHousemateDebts: protectedProcedure
		.input(z.object({ housemateId: z.number() }))
		.handler(async ({ input }) => {
			return await db
				.select({
					debt: debts,
					bill: bills,
				})
				.from(debts)
				.innerJoin(bills, eq(debts.billId, bills.id))
				.where(eq(debts.housemateId, input.housemateId))
				.orderBy(desc(bills.createdAt));
		}),

	// Get housemate's outstanding debts
	getHousemateOutstandingDebts: protectedProcedure
		.input(z.object({ housemateId: z.number() }))
		.handler(async ({ input }) => {
			return await db
				.select({
					debt: debts,
					bill: bills,
				})
				.from(debts)
				.innerJoin(bills, eq(debts.billId, bills.id))
				.where(
					and(
						eq(debts.housemateId, input.housemateId),
						eq(debts.isPaid, false),
					),
				)
				.orderBy(desc(bills.dueDate));
		}),

	// Get housemate payment statistics
	getHousemateStats: protectedProcedure
		.input(z.object({ housemateId: z.number() }))
		.handler(async ({ input }) => {
			const allDebts = await db
				.select()
				.from(debts)
				.where(eq(debts.housemateId, input.housemateId));

			const paidDebts = allDebts.filter((debt) => debt.isPaid);
			const unpaidDebts = allDebts.filter((debt) => !debt.isPaid);

			const totalOwed = allDebts.reduce(
				(sum, debt) => sum + debt.amountOwed,
				0,
			);
			const totalPaid = paidDebts.reduce(
				(sum, debt) => sum + debt.amountOwed,
				0,
			);
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
				paymentRate:
					allDebts.length > 0 ? paidDebts.length / allDebts.length : 0,
			};
		}),

	// Deactivate a housemate (soft delete)
	deactivateHousemate: protectedProcedure
		.input(z.object({ id: z.number() }))
		.handler(async ({ input }) => {
			const [updatedHousemate] = await db
				.update(housemates)
				.set({
					isActive: false,
					updatedAt: new Date(),
				})
				.where(eq(housemates.id, input.id))
				.returning();

			if (!updatedHousemate) {
				throw new Error("Housemate not found");
			}

			return updatedHousemate;
		}),

	// Reactivate a housemate
	reactivateHousemate: protectedProcedure
		.input(z.object({ id: z.number() }))
		.handler(async ({ input }) => {
			const [updatedHousemate] = await db
				.update(housemates)
				.set({
					isActive: true,
					updatedAt: new Date(),
				})
				.where(eq(housemates.id, input.id))
				.returning();

			if (!updatedHousemate) {
				throw new Error("Housemate not found");
			}

			return updatedHousemate;
		}),
};
