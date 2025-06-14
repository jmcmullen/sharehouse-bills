import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { debts } from "../db/schema/debts";
import { housemates } from "../db/schema/housemates";
import { unreconciledTransactions } from "../db/schema/unreconciled-transactions";

interface UpBankTransaction {
	type: string;
	id: string;
	attributes: {
		status: string;
		rawText: string;
		description: string;
		message: string | null;
		amount: {
			currencyCode: string;
			value: string;
			valueInBaseUnits: number;
		};
		settledAt: string;
		createdAt: string;
	};
}

interface ReconciliationResult {
	success: boolean;
	type: "exact_match" | "combination_match" | "no_match" | "duplicate";
	matchedDebts?: number[];
	housemateId?: number | null;
	reason?: string;
	amountProcessed?: number;
}

/**
 * Main entry point for processing Up Bank transactions
 */
export async function processTransaction(
	transaction: UpBankTransaction,
): Promise<ReconciliationResult> {
	const transactionId = transaction.id;
	const amountInCents = transaction.attributes.amount.valueInBaseUnits;
	const amountInDollars = amountInCents / 100;

	// Check if this transaction has already been processed
	const existingRecord = await db
		.select()
		.from(unreconciledTransactions)
		.where(eq(unreconciledTransactions.transactionId, transactionId))
		.limit(1);

	if (existingRecord.length > 0) {
		return {
			success: false,
			type: "duplicate",
			reason: "Transaction already processed",
		};
	}

	// Try to identify the housemate from the transaction
	const housemateId = await identifyHousemate(transaction);

	// Try exact match first
	const exactMatch = await findExactMatches(amountInDollars, housemateId);
	if (exactMatch.length > 0) {
		await markDebtsAsPaid(exactMatch);
		return {
			success: true,
			type: "exact_match",
			matchedDebts: exactMatch.map((d) => d.id),
			housemateId,
			amountProcessed: amountInDollars,
		};
	}

	// Try combination match
	const combinationMatches = await findCombinationMatches(
		amountInDollars,
		housemateId,
	);
	if (combinationMatches.length > 0) {
		await markDebtsAsPaid(combinationMatches);
		return {
			success: true,
			type: "combination_match",
			matchedDebts: combinationMatches.map((d) => d.id),
			housemateId,
			amountProcessed: amountInDollars,
		};
	}

	// No match found - store as unreconciled
	const reason = housemateId ? "no_match" : "insufficient_data";
	await storeUnreconciledTransaction(transaction, reason);

	return {
		success: false,
		type: "no_match",
		reason,
		housemateId,
		amountProcessed: amountInDollars,
	};
}

/**
 * Find exact matches for a given amount (with 1 cent tolerance for rounding)
 */
export async function findExactMatches(
	amount: number,
	housemateId?: number | null,
): Promise<(typeof debts.$inferSelect)[]> {
	const tolerance = 0.01; // Allow 1 cent tolerance for rounding
	const whereConditions = [eq(debts.isPaid, false)];

	if (housemateId) {
		whereConditions.push(eq(debts.housemateId, housemateId));
	}

	// Get all unpaid debts for the housemate (or all if no housemate specified)
	const unpaidDebts = await db
		.select()
		.from(debts)
		.where(and(...whereConditions));

	// Find debts within tolerance of the payment amount
	const matchingDebts = unpaidDebts.filter(
		(debt) => Math.abs(debt.amountOwed - amount) <= tolerance,
	);

	// Return the first match (closest to the amount)
	if (matchingDebts.length > 0) {
		const closest = matchingDebts.reduce((prev, curr) =>
			Math.abs(curr.amountOwed - amount) < Math.abs(prev.amountOwed - amount)
				? curr
				: prev,
		);
		return [closest];
	}

	return [];
}

/**
 * Find combination of debts that sum to the transaction amount
 * Uses a simplified approach - looks for combinations up to 3 debts
 */
export async function findCombinationMatches(
	amount: number,
	housemateId?: number | null,
): Promise<(typeof debts.$inferSelect)[]> {
	const tolerance = 0.01; // Allow 1 cent tolerance for rounding

	const whereConditions = [eq(debts.isPaid, false)];
	if (housemateId) {
		whereConditions.push(eq(debts.housemateId, housemateId));
	}

	const unpaidDebts = await db
		.select()
		.from(debts)
		.where(and(...whereConditions))
		.orderBy(debts.amountOwed);

	// Try combinations of 2 debts
	for (let i = 0; i < unpaidDebts.length; i++) {
		for (let j = i + 1; j < unpaidDebts.length; j++) {
			const sum = unpaidDebts[i].amountOwed + unpaidDebts[j].amountOwed;
			if (Math.abs(sum - amount) <= tolerance) {
				return [unpaidDebts[i], unpaidDebts[j]];
			}
		}
	}

	// Try combinations of 3 debts
	for (let i = 0; i < unpaidDebts.length; i++) {
		for (let j = i + 1; j < unpaidDebts.length; j++) {
			for (let k = j + 1; k < unpaidDebts.length; k++) {
				const sum =
					unpaidDebts[i].amountOwed +
					unpaidDebts[j].amountOwed +
					unpaidDebts[k].amountOwed;
				if (Math.abs(sum - amount) <= tolerance) {
					return [unpaidDebts[i], unpaidDebts[j], unpaidDebts[k]];
				}
			}
		}
	}

	return [];
}

/**
 * Try to identify the housemate from transaction description or bank alias
 */
export async function identifyHousemate(
	transaction: UpBankTransaction,
): Promise<number | null> {
	const description = transaction.attributes.description.toLowerCase();
	const rawText = transaction.attributes.rawText.toLowerCase();
	const message = transaction.attributes.message?.toLowerCase() || "";

	const activeHousemates = await db
		.select()
		.from(housemates)
		.where(eq(housemates.isActive, true));

	// Look for exact bank alias matches first
	for (const housemate of activeHousemates) {
		if (housemate.bankAlias) {
			const alias = housemate.bankAlias.toLowerCase();
			if (
				description.includes(alias) ||
				rawText.includes(alias) ||
				message.includes(alias)
			) {
				return housemate.id;
			}
		}
	}

	// Fall back to name matching
	for (const housemate of activeHousemates) {
		const name = housemate.name.toLowerCase();
		const firstName = name.split(" ")[0];

		if (
			description.includes(name) ||
			rawText.includes(name) ||
			message.includes(name) ||
			description.includes(firstName) ||
			rawText.includes(firstName) ||
			message.includes(firstName)
		) {
			return housemate.id;
		}
	}

	return null;
}

/**
 * Mark debts as paid and set the payment timestamp
 */
export async function markDebtsAsPaid(
	debtsToMark: (typeof debts.$inferSelect)[],
): Promise<void> {
	const now = new Date();

	for (const debt of debtsToMark) {
		await db
			.update(debts)
			.set({
				isPaid: true,
				paidAt: now,
				updatedAt: now,
			})
			.where(eq(debts.id, debt.id));
	}
}

/**
 * Store unreconciled transaction for manual review
 */
export async function storeUnreconciledTransaction(
	transaction: UpBankTransaction,
	reason: "no_match" | "ambiguous_match" | "insufficient_data",
): Promise<void> {
	const amountInDollars = transaction.attributes.amount.valueInBaseUnits / 100;

	await db.insert(unreconciledTransactions).values({
		transactionId: transaction.id,
		description: transaction.attributes.description,
		amount: amountInDollars,
		reason,
		rawData: transaction,
	});
}

/**
 * Get all unreconciled transactions for manual review
 */
export async function getUnreconciledTransactions(): Promise<
	(typeof unreconciledTransactions.$inferSelect)[]
> {
	return await db
		.select()
		.from(unreconciledTransactions)
		.orderBy(sql`${unreconciledTransactions.createdAt} DESC`);
}

/**
 * Manually reconcile a transaction with specific debts
 */
export async function manuallyReconcileTransaction(
	transactionId: string,
	debtIds: number[],
): Promise<ReconciliationResult> {
	// Get the unreconciled transaction
	const unreconciledTransaction = await db
		.select()
		.from(unreconciledTransactions)
		.where(eq(unreconciledTransactions.transactionId, transactionId))
		.limit(1);

	if (unreconciledTransaction.length === 0) {
		return {
			success: false,
			type: "no_match",
			reason: "Transaction not found in unreconciled list",
		};
	}

	// Get the specified debts and verify they're unpaid
	const targetDebts = await db
		.select()
		.from(debts)
		.where(and(sql`${debts.id} IN ${debtIds}`, eq(debts.isPaid, false)));

	if (targetDebts.length !== debtIds.length) {
		return {
			success: false,
			type: "no_match",
			reason: "Some specified debts are already paid or don't exist",
		};
	}

	// Mark debts as paid
	await markDebtsAsPaid(targetDebts);

	// Remove from unreconciled transactions
	await db
		.delete(unreconciledTransactions)
		.where(eq(unreconciledTransactions.transactionId, transactionId));

	return {
		success: true,
		type: "exact_match",
		matchedDebts: debtIds,
		amountProcessed: unreconciledTransaction[0].amount,
	};
}
