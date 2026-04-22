import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { bills } from "../db/schema/bills";
import { debts } from "../db/schema/debts";
import { housemates } from "../db/schema/housemates";
import { paymentTransactions } from "../db/schema/payment-transactions";
import { unreconciledTransactions } from "../db/schema/unreconciled-transactions";
import {
	getRemainingDebtAmount,
	roundCurrency,
	updateBillStatusFromDebts,
} from "./debt-payment-state";

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

type ReconciliationMatchType =
	| "exact_match"
	| "combination_match"
	| "partial_allocation"
	| "credit_created"
	| "manual_match"
	| "no_match"
	| "ambiguous_match"
	| "insufficient_data"
	| "ignored";

type UnreconciledReason = "no_match" | "ambiguous_match" | "insufficient_data";

type ReconciliationResultType =
	| "exact_match"
	| "combination_match"
	| "partial_allocation"
	| "credit_created"
	| "no_match"
	| "duplicate"
	| "ignored";

interface ReconciliationResult {
	success: boolean;
	type: ReconciliationResultType;
	matchedDebts?: number[];
	housemateId?: number | null;
	reason?: string;
	amountProcessed?: number;
	creditCreated?: number;
}

interface DebtCandidate {
	id: number;
	billId: number;
	housemateId: number;
	amountOwed: number;
	amountPaid: number;
	createdAt: Date;
	billDueDate: Date;
}

type HousemateRecord = typeof housemates.$inferSelect;

type ParsedPaymentIntent =
	| {
			kind: "ignored";
			reason: "no_billing_keyword";
	  }
	| {
			kind: "unreconciled";
			reason: UnreconciledReason;
	  }
	| {
			kind: "bill_payment";
			housemateId: number;
			matchedBy: "explicit_beneficiary" | "sender_fallback";
	  };

const BILLING_INTENT_TOKENS = new Set(["rent", "bill", "bills"]);

function toCents(amount: number) {
	return Math.round(amount * 100);
}

function parseTimestamp(value: string) {
	const parsedDate = new Date(value);
	return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function normalizeText(value: string | null | undefined) {
	if (!value) {
		return "";
	}

	return value
		.toLowerCase()
		.replace(/['’]s\b/g, " ")
		.replace(/[^a-z0-9]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function tokenize(value: string) {
	if (!value) {
		return [] as string[];
	}

	return value.split(" ").filter(Boolean);
}

function getPrimaryFirstName(name: string) {
	const normalizedName = normalizeText(name);
	return normalizedName.split(" ")[0] ?? normalizedName;
}

function parseAliasPhrases(housemate: HousemateRecord) {
	const aliasValues = [
		housemate.name,
		getPrimaryFirstName(housemate.name),
		...(housemate.bankAlias
			? housemate.bankAlias
					.split(/[,\n;|/]+/)
					.map((value) => value.trim())
					.filter(Boolean)
			: []),
	];

	return Array.from(
		new Set(aliasValues.map((value) => normalizeText(value)).filter(Boolean)),
	);
}

function findPhraseStartIndexes(tokens: string[], phraseTokens: string[]) {
	if (phraseTokens.length === 0 || phraseTokens.length > tokens.length) {
		return [] as number[];
	}

	const matches: number[] = [];

	for (
		let index = 0;
		index <= tokens.length - phraseTokens.length;
		index += 1
	) {
		let isMatch = true;

		for (
			let phraseTokenIndex = 0;
			phraseTokenIndex < phraseTokens.length;
			phraseTokenIndex += 1
		) {
			if (tokens[index + phraseTokenIndex] !== phraseTokens[phraseTokenIndex]) {
				isMatch = false;
				break;
			}
		}

		if (isMatch) {
			matches.push(index);
		}
	}

	return matches;
}

function hasBillingIntent(tokens: string[]) {
	return tokens.some((token) => BILLING_INTENT_TOKENS.has(token));
}

function resolveUniqueHousemate(matches: HousemateRecord[]) {
	const uniqueMatches = Array.from(
		new Map(matches.map((housemate) => [housemate.id, housemate])).values(),
	);

	if (uniqueMatches.length === 0) {
		return null;
	}

	if (uniqueMatches.length === 1) {
		return uniqueMatches[0];
	}

	return "ambiguous" as const;
}

function getExplicitBeneficiaryMatches(
	activeHousemates: HousemateRecord[],
	noteTokens: string[],
) {
	return activeHousemates.filter((housemate) => {
		return parseAliasPhrases(housemate).some((aliasPhrase) => {
			const aliasTokens = tokenize(aliasPhrase);

			return findPhraseStartIndexes(noteTokens, aliasTokens).some(
				(startIndex) => {
					const aliasEndIndex = startIndex + aliasTokens.length - 1;
					const nearbyStartIndex = Math.max(0, startIndex - 2);
					const nearbyEndIndex = Math.min(
						noteTokens.length - 1,
						aliasEndIndex + 2,
					);

					return noteTokens
						.slice(nearbyStartIndex, nearbyEndIndex + 1)
						.some((token) => BILLING_INTENT_TOKENS.has(token));
				},
			);
		});
	});
}

function getMatchesByStrategy(
	activeHousemates: HousemateRecord[],
	normalizedText: string,
	normalizedTokens: string[],
	strategy: "bankAlias" | "fullName" | "firstName",
) {
	if (!normalizedText) {
		return [] as HousemateRecord[];
	}

	return activeHousemates.filter((housemate) => {
		if (strategy === "bankAlias") {
			return parseAliasPhrases(housemate)
				.filter((aliasPhrase) => aliasPhrase !== normalizeText(housemate.name))
				.some((aliasPhrase) => {
					const aliasTokens = tokenize(aliasPhrase);
					if (aliasTokens.length === 0) {
						return false;
					}

					if (aliasTokens.length === 1) {
						return normalizedTokens.includes(aliasTokens[0]);
					}

					return ` ${normalizedText} `.includes(` ${aliasPhrase} `);
				});
		}

		if (strategy === "fullName") {
			const fullName = normalizeText(housemate.name);
			return fullName ? ` ${normalizedText} `.includes(` ${fullName} `) : false;
		}

		const firstName = getPrimaryFirstName(housemate.name);
		return firstName.length > 1 ? normalizedTokens.includes(firstName) : false;
	});
}

function parsePaymentIntent(
	transaction: UpBankTransaction,
	activeHousemates: HousemateRecord[],
): ParsedPaymentIntent {
	const noteText = normalizeText(
		`${transaction.attributes.description} ${transaction.attributes.message ?? ""}`,
	);
	const noteTokens = tokenize(noteText);

	if (!hasBillingIntent(noteTokens)) {
		return {
			kind: "ignored",
			reason: "no_billing_keyword",
		};
	}

	const explicitBeneficiary = resolveUniqueHousemate(
		getExplicitBeneficiaryMatches(activeHousemates, noteTokens),
	);

	if (explicitBeneficiary === "ambiguous") {
		return {
			kind: "unreconciled",
			reason: "ambiguous_match",
		};
	}

	if (explicitBeneficiary) {
		return {
			kind: "bill_payment",
			housemateId: explicitBeneficiary.id,
			matchedBy: "explicit_beneficiary",
		};
	}

	const combinedText = normalizeText(
		[
			transaction.attributes.description,
			transaction.attributes.rawText,
			transaction.attributes.message ?? "",
		].join(" "),
	);
	const combinedTokens = tokenize(combinedText);
	const matchTiers = [
		getMatchesByStrategy(
			activeHousemates,
			combinedText,
			combinedTokens,
			"bankAlias",
		),
		getMatchesByStrategy(
			activeHousemates,
			combinedText,
			combinedTokens,
			"fullName",
		),
		getMatchesByStrategy(
			activeHousemates,
			combinedText,
			combinedTokens,
			"firstName",
		),
	];

	for (const matches of matchTiers) {
		const resolvedHousemate = resolveUniqueHousemate(matches);

		if (resolvedHousemate === "ambiguous") {
			return {
				kind: "unreconciled",
				reason: "ambiguous_match",
			};
		}

		if (resolvedHousemate) {
			return {
				kind: "bill_payment",
				housemateId: resolvedHousemate.id,
				matchedBy: "sender_fallback",
			};
		}
	}

	return {
		kind: "unreconciled",
		reason: "insufficient_data",
	};
}

async function recordPaymentTransaction(
	transaction: UpBankTransaction,
	options: {
		housemateId?: number | null;
		status: "matched" | "unreconciled" | "ignored";
		matchType: ReconciliationMatchType;
		matchedDebtIds?: number[];
	},
) {
	await db.insert(paymentTransactions).values({
		transactionId: transaction.id,
		description: transaction.attributes.description,
		amount: transaction.attributes.amount.valueInBaseUnits / 100,
		housemateId: options.housemateId ?? null,
		status: options.status,
		matchType: options.matchType,
		matchedDebtIds: options.matchedDebtIds,
		rawData: transaction,
		settledAt: parseTimestamp(transaction.attributes.settledAt),
		upCreatedAt: parseTimestamp(transaction.attributes.createdAt),
	});
}

async function getExistingTransactionResult(
	transactionId: string,
): Promise<ReconciliationResult | null> {
	const [existingPayment] = await db
		.select({
			status: paymentTransactions.status,
			matchType: paymentTransactions.matchType,
			housemateId: paymentTransactions.housemateId,
			matchedDebtIds: paymentTransactions.matchedDebtIds,
			amount: paymentTransactions.amount,
		})
		.from(paymentTransactions)
		.where(eq(paymentTransactions.transactionId, transactionId))
		.limit(1);

	if (existingPayment) {
		return {
			success: false,
			type: "duplicate",
			reason: `Transaction already recorded with status ${existingPayment.status} (${existingPayment.matchType})`,
			housemateId: existingPayment.housemateId,
			matchedDebts: existingPayment.matchedDebtIds ?? undefined,
			amountProcessed: existingPayment.amount,
		};
	}

	const [existingUnreconciled] = await db
		.select({
			amount: unreconciledTransactions.amount,
			reason: unreconciledTransactions.reason,
		})
		.from(unreconciledTransactions)
		.where(eq(unreconciledTransactions.transactionId, transactionId))
		.limit(1);

	if (!existingUnreconciled) {
		return null;
	}

	return {
		success: false,
		type: "duplicate",
		reason: `Transaction already exists in unreconciled queue (${existingUnreconciled.reason})`,
		amountProcessed: existingUnreconciled.amount,
	};
}

async function storeUnreconciledTransaction(
	transaction: UpBankTransaction,
	reason: UnreconciledReason,
	housemateId: number | null,
) {
	const amountInDollars = transaction.attributes.amount.valueInBaseUnits / 100;

	await db.insert(unreconciledTransactions).values({
		transactionId: transaction.id,
		description: transaction.attributes.description,
		amount: amountInDollars,
		reason,
		rawData: transaction,
	});

	await recordPaymentTransaction(transaction, {
		housemateId,
		status: "unreconciled",
		matchType: reason,
	});
}

export async function getUnreconciledTransactions(): Promise<
	(typeof unreconciledTransactions.$inferSelect)[]
> {
	return await db
		.select()
		.from(unreconciledTransactions)
		.orderBy(desc(unreconciledTransactions.createdAt));
}

export async function processTransaction(
	transaction: UpBankTransaction,
): Promise<ReconciliationResult> {
	const transactionId = transaction.id;
	const amountInDollars = transaction.attributes.amount.valueInBaseUnits / 100;
	const existingTransaction = await getExistingTransactionResult(transactionId);

	if (existingTransaction) {
		return existingTransaction;
	}

	const activeHousemates = await db
		.select()
		.from(housemates)
		.where(eq(housemates.isActive, true));
	const parsedPaymentIntent = parsePaymentIntent(transaction, activeHousemates);

	if (parsedPaymentIntent.kind === "ignored") {
		await recordPaymentTransaction(transaction, {
			status: "ignored",
			matchType: "ignored",
		});

		return {
			success: true,
			type: "ignored",
			reason: parsedPaymentIntent.reason,
			amountProcessed: amountInDollars,
		};
	}

	if (parsedPaymentIntent.kind === "unreconciled") {
		await storeUnreconciledTransaction(
			transaction,
			parsedPaymentIntent.reason,
			null,
		);

		return {
			success: false,
			type: "no_match",
			reason: parsedPaymentIntent.reason,
			housemateId: null,
			amountProcessed: amountInDollars,
		};
	}

	const matchedDebtIds: number[] = [];
	const affectedBillIds = new Set<number>();
	const now = new Date();
	const result = await db.transaction(async (tx) => {
		const debtCandidates: DebtCandidate[] = await tx
			.select({
				id: debts.id,
				billId: debts.billId,
				housemateId: debts.housemateId,
				amountOwed: debts.amountOwed,
				amountPaid: debts.amountPaid,
				createdAt: debts.createdAt,
				billDueDate: bills.dueDate,
			})
			.from(debts)
			.innerJoin(bills, eq(debts.billId, bills.id))
			.where(
				and(
					eq(debts.housemateId, parsedPaymentIntent.housemateId),
					eq(debts.isPaid, false),
				),
			)
			.orderBy(asc(bills.dueDate), asc(debts.createdAt), asc(debts.id));

		let remainingAmount = amountInDollars;
		let partiallyAllocated = false;

		for (const debtCandidate of debtCandidates) {
			const remainingDebtAmount = getRemainingDebtAmount(debtCandidate);
			if (remainingDebtAmount <= 0.009 || remainingAmount <= 0.009) {
				continue;
			}

			const allocatedAmount = Math.min(remainingAmount, remainingDebtAmount);
			const nextAmountPaid = roundCurrency(
				debtCandidate.amountPaid + allocatedAmount,
			);
			const fullyPaid =
				getRemainingDebtAmount({
					amountOwed: debtCandidate.amountOwed,
					amountPaid: nextAmountPaid,
				}) <= 0.009;

			if (allocatedAmount + 0.009 < remainingDebtAmount) {
				partiallyAllocated = true;
			}

			await tx
				.update(debts)
				.set({
					amountPaid: fullyPaid ? debtCandidate.amountOwed : nextAmountPaid,
					isPaid: fullyPaid,
					paidAt: fullyPaid ? now : null,
					updatedAt: now,
				})
				.where(eq(debts.id, debtCandidate.id));

			matchedDebtIds.push(debtCandidate.id);
			affectedBillIds.add(debtCandidate.billId);
			remainingAmount = roundCurrency(remainingAmount - allocatedAmount);
		}

		let creditCreated = 0;
		if (remainingAmount > 0.009) {
			const [housemate] = await tx
				.select({
					creditBalance: housemates.creditBalance,
				})
				.from(housemates)
				.where(eq(housemates.id, parsedPaymentIntent.housemateId))
				.limit(1);

			const currentCreditBalance = housemate?.creditBalance ?? 0;
			creditCreated = remainingAmount;
			await tx
				.update(housemates)
				.set({
					creditBalance: roundCurrency(currentCreditBalance + remainingAmount),
					updatedAt: now,
				})
				.where(eq(housemates.id, parsedPaymentIntent.housemateId));
		}

		for (const billId of affectedBillIds) {
			const billDebts = await tx
				.select({
					amountOwed: debts.amountOwed,
					amountPaid: debts.amountPaid,
				})
				.from(debts)
				.where(eq(debts.billId, billId));

			const totalRemainingAmount = billDebts.reduce((sum, debt) => {
				return sum + getRemainingDebtAmount(debt);
			}, 0);
			const totalPaidAmount = billDebts.reduce((sum, debt) => {
				return sum + roundCurrency(debt.amountPaid);
			}, 0);

			let status: "pending" | "partially_paid" | "paid" = "pending";
			if (totalRemainingAmount <= 0.009) {
				status = "paid";
			} else if (totalPaidAmount > 0.009) {
				status = "partially_paid";
			}

			await tx
				.update(bills)
				.set({
					status,
					updatedAt: now,
				})
				.where(eq(bills.id, billId));
		}

		let matchType: ReconciliationResultType = "credit_created";
		if (creditCreated > 0.009 || matchedDebtIds.length === 0) {
			matchType = "credit_created";
		} else if (partiallyAllocated) {
			matchType = "partial_allocation";
		} else if (matchedDebtIds.length === 1) {
			matchType = "exact_match";
		} else {
			matchType = "combination_match";
		}

		await tx.insert(paymentTransactions).values({
			transactionId: transaction.id,
			description: transaction.attributes.description,
			amount: amountInDollars,
			housemateId: parsedPaymentIntent.housemateId,
			status: "matched",
			matchType,
			matchedDebtIds,
			rawData: transaction,
			settledAt: parseTimestamp(transaction.attributes.settledAt),
			upCreatedAt: parseTimestamp(transaction.attributes.createdAt),
			createdAt: now,
			updatedAt: now,
		});

		return {
			success: true,
			type: matchType,
			matchedDebts: matchedDebtIds.length > 0 ? matchedDebtIds : undefined,
			housemateId: parsedPaymentIntent.housemateId,
			amountProcessed: amountInDollars,
			creditCreated,
		} satisfies ReconciliationResult;
	});

	return result;
}

export async function manuallyReconcileTransaction(
	transactionId: string,
	debtIds: number[],
): Promise<ReconciliationResult> {
	const [unreconciledTransaction] = await db
		.select()
		.from(unreconciledTransactions)
		.where(eq(unreconciledTransactions.transactionId, transactionId))
		.limit(1);

	if (!unreconciledTransaction) {
		return {
			success: false,
			type: "no_match",
			reason: "Transaction not found in unreconciled list",
		};
	}

	const targetDebts = await db
		.select({
			id: debts.id,
			billId: debts.billId,
			housemateId: debts.housemateId,
			amountOwed: debts.amountOwed,
			amountPaid: debts.amountPaid,
		})
		.from(debts)
		.where(and(inArray(debts.id, debtIds), eq(debts.isPaid, false)));

	if (targetDebts.length !== debtIds.length) {
		return {
			success: false,
			type: "no_match",
			reason: "Some specified debts are already paid or don't exist",
		};
	}

	const expectedAmountCents = toCents(unreconciledTransaction.amount);
	const selectedDebtAmountCents = targetDebts.reduce((sum, debt) => {
		return sum + toCents(getRemainingDebtAmount(debt));
	}, 0);

	if (selectedDebtAmountCents !== expectedAmountCents) {
		return {
			success: false,
			type: "no_match",
			reason: "Selected debts do not add up to the transaction amount",
		};
	}

	const now = new Date();
	for (const debt of targetDebts) {
		await db
			.update(debts)
			.set({
				amountPaid: debt.amountOwed,
				isPaid: true,
				paidAt: now,
				updatedAt: now,
			})
			.where(eq(debts.id, debt.id));
	}

	for (const billId of new Set(targetDebts.map((debt) => debt.billId))) {
		await updateBillStatusFromDebts(billId);
	}

	const matchedHousemateIds = Array.from(
		new Set(targetDebts.map((debt) => debt.housemateId)),
	);
	const matchedHousemateId =
		matchedHousemateIds.length === 1 ? matchedHousemateIds[0] : null;
	const [existingPaymentTransaction] = await db
		.select({ id: paymentTransactions.id })
		.from(paymentTransactions)
		.where(eq(paymentTransactions.transactionId, transactionId))
		.limit(1);

	if (existingPaymentTransaction) {
		await db
			.update(paymentTransactions)
			.set({
				housemateId: matchedHousemateId,
				status: "matched",
				matchType: "manual_match",
				matchedDebtIds: debtIds,
				updatedAt: now,
			})
			.where(eq(paymentTransactions.transactionId, transactionId));
	} else {
		await db.insert(paymentTransactions).values({
			transactionId,
			description: unreconciledTransaction.description,
			amount: unreconciledTransaction.amount,
			housemateId: matchedHousemateId,
			status: "matched",
			matchType: "manual_match",
			matchedDebtIds: debtIds,
			rawData: unreconciledTransaction.rawData,
			createdAt: now,
			updatedAt: now,
		});
	}

	await db
		.delete(unreconciledTransactions)
		.where(eq(unreconciledTransactions.transactionId, transactionId));

	return {
		success: true,
		type: debtIds.length === 1 ? "exact_match" : "combination_match",
		matchedDebts: debtIds,
		amountProcessed: unreconciledTransaction.amount,
		housemateId: matchedHousemateId,
	};
}
