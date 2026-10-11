import type { Client, Row } from "@libsql/client";
import { z } from "zod";
import { getAccountPayments, suggestBankReceipt } from "./account-payments";
import {
	billAllocationsSchema,
	insertReceipt,
	voidReceipts,
	writeAllocations,
} from "./allocate";
import { isSettledExternalAud, receivedAt, setDecision } from "./bank-ingest";
import { loadHousemates, requireHousemate } from "./housemates";
import { type BankTransaction, bankTransactionSchema } from "./model";
import {
	enqueuePaymentReceipt,
	paymentReceiptKind,
} from "./receipt-notifications";
import { ignoredBankReason } from "./review-policy";
import { type Executor, withWriteTransaction } from "./transaction";

const base = {
	transactionId: z.string().min(1),
	expectedRevision: z.number().int(),
	reason: z.string().trim().max(1000).default(""),
};
const confirmSchema = z.object({
	...base,
	action: z.literal("confirm"),
	housemateId: z.string().min(1),
	allocations: billAllocationsSchema,
});
const refundSchema = z.object({
	...base,
	action: z.literal("refund"),
	housemateId: z.string().min(1),
});
const splitSchema = z.object({
	...base,
	action: z.literal("split"),
	allocations: z
		.array(
			z.object({
				housemateId: z.string().min(1),
				amountCents: z.number().int().positive().safe(),
			}),
		)
		.min(2)
		.max(10),
});
const excludeSchema = z.object({ ...base, action: z.literal("exclude") });
// Bulk confirmation trusts only an exact suggestion, recomputed on the server.
const suggestedSchema = z.object({ ...base, action: z.literal("suggested") });

export const decisionSchema = z.discriminatedUnion("action", [
	confirmSchema,
	refundSchema,
	splitSchema,
	excludeSchema,
]);
type Decision = z.infer<typeof decisionSchema>;
export const batchDecisionSchema = z
	.array(z.discriminatedUnion("action", [suggestedSchema, excludeSchema]))
	.min(1)
	.max(10);

interface BankRow {
	row: Row;
	transaction: BankTransaction;
}

export async function decideBankTransaction(
	client: Client,
	input: z.input<typeof decisionSchema>,
): Promise<void> {
	const decision = decisionSchema.parse(input);
	await withWriteTransaction(client, (tx) => applyDecision(tx, decision));
}

export async function decideBankTransactions(
	client: Client,
	input: z.input<typeof batchDecisionSchema>,
): Promise<void> {
	const decisions = batchDecisionSchema.parse(input);
	if (
		new Set(decisions.map((item) => item.transactionId)).size !==
		decisions.length
	)
		throw new Error("Select each payment only once");
	await withWriteTransaction(client, async (tx) => {
		for (const decision of decisions)
			await (decision.action === "suggested"
				? applySuggested(tx, decision)
				: applyDecision(tx, decision));
	});
}

async function applyDecision(tx: Executor, input: Decision): Promise<void> {
	const bank = await loadBankRow(
		tx,
		input.transactionId,
		input.expectedRevision,
	);
	if (input.action === "exclude") {
		const reason = input.reason || "Not a household payment";
		await voidReceipts(tx, bank.transaction.id, reason);
		await decide(tx, bank, {
			decision: "excluded",
			housemateId: nullableText(bank.row.housemate_id),
			reason,
		});
		return;
	}
	validatePosting(bank, input.reason);
	if (input.action === "split") return split(tx, bank, input);
	if (input.action === "refund") return refund(tx, bank, input);
	return confirm(tx, bank, input);
}

// One receipt for the housemate, its bills allocated in the same transaction.
// Empty allocations keep the money as credit on purpose. Re-confirming the same
// money for the same housemate keeps its receipt, so the housemate hears a
// correction rather than a second receipt.
async function confirm(
	tx: Executor,
	bank: BankRow,
	input: z.infer<typeof confirmSchema>,
): Promise<void> {
	const amountCents = bank.transaction.attributes.amount.valueInBaseUnits;
	if (amountCents <= 0)
		throw new Error("Only money received can be confirmed against bills");
	const housemateId = await requireHousemate(tx, input.housemateId);
	const receiptId =
		(await keptReceipt(tx, bank, housemateId, input.reason)) ??
		(await replaceReceipts(tx, bank, housemateId, input.reason));
	await writeAllocations(
		tx,
		await getAccountPayments(tx, housemateId),
		receiptId,
		input.allocations,
	);
	await decide(tx, bank, {
		decision: "confirmed",
		housemateId,
		reason: input.reason || "Household payment confirmed by administrator",
	});
	await enqueuePaymentReceipt(
		tx,
		housemateId,
		receiptId,
		await paymentReceiptKind(tx, receiptId),
	);
}

// The transfer's single live receipt when it already credits this housemate
// with this amount, its note updated to the new decision.
async function keptReceipt(
	tx: Executor,
	bank: BankRow,
	housemateId: string,
	note: string,
): Promise<string | null> {
	const live = (
		await tx.execute({
			sql: "SELECT id,housemate_id,amount_cents FROM receipts WHERE bank_transaction_id=? AND voided_at IS NULL",
			args: [bank.transaction.id],
		})
	).rows;
	const [receipt] = live;
	if (
		live.length !== 1 ||
		String(receipt.housemate_id) !== housemateId ||
		Number(receipt.amount_cents) !==
			bank.transaction.attributes.amount.valueInBaseUnits
	)
		return null;
	await tx.execute({
		sql: "UPDATE receipts SET note=? WHERE id=?",
		args: [note, receipt.id],
	});
	return String(receipt.id);
}

async function replaceReceipts(
	tx: Executor,
	bank: BankRow,
	housemateId: string,
	note: string,
): Promise<string> {
	await voidReceipts(tx, bank.transaction.id, "Replaced by a new decision");
	return insertReceipt(tx, {
		housemateId,
		amountCents: bank.transaction.attributes.amount.valueInBaseUnits,
		receivedAt: receivedAt(bank.transaction),
		kind: "bank",
		bankTransactionId: bank.transaction.id,
		note,
	});
}

// Money the household sent back to a housemate: a negative receipt.
async function refund(
	tx: Executor,
	bank: BankRow,
	input: z.infer<typeof refundSchema>,
): Promise<void> {
	const amountCents = bank.transaction.attributes.amount.valueInBaseUnits;
	if (amountCents >= 0) throw new Error("Only money sent can be a refund");
	if (input.reason.length < 5)
		throw new Error("Add a note explaining the household refund");
	const housemateId = await requireHousemate(tx, input.housemateId);
	await voidReceipts(tx, bank.transaction.id, "Replaced by a new decision");
	await insertReceipt(tx, {
		housemateId,
		amountCents,
		receivedAt: receivedAt(bank.transaction),
		kind: "bank",
		bankTransactionId: bank.transaction.id,
		note: input.reason,
	});
	await decide(tx, bank, {
		decision: "confirmed",
		housemateId,
		reason: input.reason,
	});
}

// One transfer covering several housemates: a receipt each, held as credit
// until each one's bills are chosen.
async function split(
	tx: Executor,
	bank: BankRow,
	input: z.infer<typeof splitSchema>,
): Promise<void> {
	const { allocations } = input;
	if (
		new Set(allocations.map((item) => item.housemateId)).size !==
		allocations.length
	)
		throw new Error("Each housemate can appear only once");
	const housemates = await loadHousemates(tx);
	if (
		allocations.some(
			(allocation) =>
				!housemates.some(
					(housemate) =>
						housemate.id === allocation.housemateId && !housemate.isOwner,
				),
		)
	)
		throw new Error("Select valid non-owner housemates");
	if (
		allocations.reduce((sum, item) => sum + item.amountCents, 0) !==
		bank.transaction.attributes.amount.valueInBaseUnits
	)
		throw new Error("Allocations must equal the payment total");
	await voidReceipts(tx, bank.transaction.id, "Replaced by a new decision");
	for (const allocation of allocations)
		await insertReceipt(tx, {
			housemateId: allocation.housemateId,
			amountCents: allocation.amountCents,
			receivedAt: receivedAt(bank.transaction),
			kind: "bank",
			bankTransactionId: bank.transaction.id,
			note: input.reason,
		});
	await decide(tx, bank, {
		decision: "confirmed",
		housemateId: null,
		reason: input.reason || "Payment allocation confirmed by administrator",
	});
}

async function applySuggested(
	tx: Executor,
	input: z.infer<typeof suggestedSchema>,
): Promise<void> {
	const bank = await loadBankRow(
		tx,
		input.transactionId,
		input.expectedRevision,
	);
	const housemateId = nullableText(bank.row.housemate_id);
	if (!housemateId) throw new Error("Choose the housemate before confirming");
	const suggestion = suggestBankReceipt(
		await getAccountPayments(tx, housemateId),
		{
			amountCents: bank.transaction.attributes.amount.valueInBaseUnits,
			receivedAt: receivedAt(bank.transaction),
			message: bank.transaction.attributes.message ?? "",
		},
	);
	if (suggestion?.confidence !== "exact")
		throw new Error(
			"Only payments that exactly match one bill can be confirmed together",
		);
	validatePosting(bank, input.reason);
	await confirm(tx, bank, {
		...input,
		action: "confirm",
		housemateId,
		allocations: suggestion.allocations,
	});
}

// Loads the stored bank transaction and rejects decisions made from a stale view.
async function loadBankRow(
	tx: Executor,
	transactionId: string,
	expectedRevision: number,
): Promise<BankRow> {
	const row = (
		await tx.execute({
			sql: "SELECT * FROM bank_transactions WHERE id=?",
			args: [transactionId],
		})
	).rows[0];
	if (!row) throw new Error("Bank transaction not found");
	if (expectedRevision !== Number(row.updated_at))
		throw new Error(
			"This payment changed since you opened it. Refresh and review it again.",
		);
	return {
		row,
		transaction: bankTransactionSchema.parse(JSON.parse(String(row.raw_data))),
	};
}

function validatePosting(bank: BankRow, reason: string): void {
	if (bank.row.bank_status === "DELETED")
		throw new Error("Deleted bank transactions cannot be credited");
	if (ignoredBankReason(bank.transaction))
		throw new Error(
			"Own-account movements, interest and merchant refunds cannot be housemate payments",
		);
	if (!isSettledExternalAud(bank.transaction))
		throw new Error("Only settled external AUD transactions can be posted");
	if (bank.row.decision === "archived" && reason.length < 5)
		throw new Error("Explain the historical charges this payment covers");
}

function decide(
	tx: Executor,
	bank: BankRow,
	input: {
		decision: "confirmed" | "excluded";
		housemateId: string | null;
		reason: string;
	},
): Promise<void> {
	return setDecision(
		tx,
		{
			id: bank.transaction.id,
			amountCents: bank.transaction.attributes.amount.valueInBaseUnits,
		},
		{ ...input, decided: true },
	);
}

function nullableText(value: unknown): string | null {
	return value === null || value === undefined ? null : String(value);
}
