// fallow-ignore-file code-duplication
import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { createError } from "evlog";
import { z } from "zod";
import { db } from "../api/db/index.server";
import { housemates } from "../api/db/schema/housemates";
import {
	loadAccount,
	loadAccounts,
} from "../api/services/account/account.server";
import { sum } from "../api/services/account/compute";
import { createPayPath } from "../api/services/pay-token.server";
import { normalizeWhatsappNumber } from "../api/services/whatsapp-phone";
import { authMiddleware } from "../lib/auth-middleware";
import { entityIdSchema } from "../lib/id";

function createHousemateNotFoundError(housemateId: string) {
	return createError({
		message: "Housemate not found",
		status: 404,
		why: `No housemate exists for id ${housemateId}.`,
		fix: "Refresh the admin view and verify the housemate still exists before retrying the action.",
	});
}

// Get all housemates
export const getAllHousemates = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async () => {
		const rows = await db
			.select()
			.from(housemates)
			.orderBy(desc(housemates.createdAt));

		return rows.map((housemate) => ({
			...housemate,
			payPath: createPayPath({
				housemateId: housemate.id,
			}),
		}));
	});

interface BalanceRow {
	id: string;
	name: string;
	isActive: boolean;
	amountCents: number;
}

function toMetric(rows: BalanceRow[]) {
	const sorted = [...rows].sort(
		(left, right) =>
			right.amountCents - left.amountCents ||
			left.name.localeCompare(right.name),
	);
	const owing = sorted.filter((row) => row.amountCents > 0);
	return {
		rows: sorted,
		totalCents: sum(owing, (row) => row.amountCents),
		count: owing.length,
	};
}

// What each housemate owes and has overdue, after held credit covers their
// oldest shares, straight from their accounts.
export const getHousemateBalances = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async () => {
		const [rows, accounts] = await Promise.all([
			db
				.select({ id: housemates.id, isActive: housemates.isActive })
				.from(housemates),
			loadAccounts(),
		]);
		const active = new Map(rows.map((row) => [row.id, row.isActive]));
		// The owner pays bills up front and never owes the house.
		const balances = accounts
			.filter((account) => !account.housemate.isOwner)
			.map((account) => ({
				id: account.housemate.id,
				name: account.housemate.name,
				isActive: active.get(account.housemate.id) ?? false,
				owesCents: account.owesCents,
				overdueCents: account.overdueCents,
			}));
		return {
			outstanding: toMetric(
				balances.map(({ owesCents, overdueCents, ...row }) => ({
					...row,
					amountCents: owesCents,
				})),
			),
			overdue: toMetric(
				balances.map(({ owesCents, overdueCents, ...row }) => ({
					...row,
					amountCents: overdueCents,
				})),
			),
		};
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
			throw createHousemateNotFoundError(data.id);
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
			throw createHousemateNotFoundError(id);
		}

		return updatedHousemate;
	});

// One housemate's account for the details modal: every share with its paid
// state, newest due first, and the account totals.
export const getHousemateAccount = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ housemateId: entityIdSchema }))
	.handler(async ({ data }) => {
		const account = await loadAccount(data.housemateId);
		if (!account) throw createHousemateNotFoundError(data.housemateId);
		return {
			remainingCents: account.remainingCents,
			owesCents: account.owesCents,
			creditCents: account.creditCents,
			shares: [...account.shares]
				.sort((a, b) => b.dueAt - a.dueAt || a.id.localeCompare(b.id))
				.map((share) => ({
					id: share.id,
					name: share.name,
					dueAt: share.dueAt,
					amountCents: share.amountCents,
					paidCents: share.paidCents,
					remainingCents: share.remainingCents,
					settledAt: share.settledAt,
				})),
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
			throw createHousemateNotFoundError(data.id);
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
			throw createHousemateNotFoundError(data.id);
		}

		return updatedHousemate;
	});
