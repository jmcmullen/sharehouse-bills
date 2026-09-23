import type { Client } from "@libsql/client";
import { z } from "zod";
import { getAccountPayments, suggestBankReceipt } from "./account-payments";
import { billAllocationsSchema, writeAllocations } from "./allocation-actions";
import {
	creditBankTransaction,
	loadBankRow,
	requireHousemate,
	validateReviewPosting,
} from "./bank-credit";
import { receivedAt } from "./bank-decisions";
import {
	enqueuePaymentReceipt,
	paymentReceiptKind,
} from "./receipt-notifications";
import { type Executor, withWriteTransaction } from "./sources";

export const confirmReceiptSchema = z.object({
	transactionId: z.string().min(1),
	housemateId: z.string().min(1),
	allocations: billAllocationsSchema,
	expectedRevision: z.number().int(),
	reason: z.string().trim().max(1000).default(""),
});
type ConfirmReceipt = z.infer<typeof confirmReceiptSchema>;

export const confirmSuggestedSchema = z.object({
	transactionId: z.string().min(1),
	action: z.literal("confirm"),
	expectedRevision: z.number().int(),
	reason: z.string().trim().max(1000).default(""),
});
type ConfirmSuggested = z.infer<typeof confirmSuggestedSchema>;

// One explicit decision: credit the bank transfer to the housemate and record
// which bills it pays. Empty allocations keep the money as credit on purpose.
export async function confirmReceipt(
	client: Client,
	input: z.input<typeof confirmReceiptSchema>,
): Promise<void> {
	const data = confirmReceiptSchema.parse(input);
	await withWriteTransaction(client, (tx) => applyConfirmReceipt(tx, data));
}

async function applyConfirmReceipt(
	tx: Executor,
	input: ConfirmReceipt,
): Promise<void> {
	const bank = await loadBankRow(
		tx,
		input.transactionId,
		input.expectedRevision,
	);
	if (bank.transaction.attributes.amount.valueInBaseUnits <= 0)
		throw new Error("Only money received can be confirmed against bills");
	validateReviewPosting(bank, { action: "credit", reason: input.reason });
	const housemateId = await requireHousemate(tx, input.housemateId);
	await creditBankTransaction(tx, bank, housemateId, input.reason);
	const receiptId = `bank:${bank.transaction.id}`;
	await writeAllocations(
		tx,
		await getAccountPayments(tx, housemateId),
		receiptId,
		input.allocations,
	);
	await enqueuePaymentReceipt(
		tx,
		housemateId,
		receiptId,
		await paymentReceiptKind(tx, receiptId),
	);
}

// Bulk confirmation trusts only an exact suggestion, recomputed here so a
// stale page cannot confirm bills that changed since it loaded.
export async function applyConfirmSuggested(
	tx: Executor,
	input: ConfirmSuggested,
): Promise<void> {
	const bank = await loadBankRow(
		tx,
		input.transactionId,
		input.expectedRevision,
	);
	const housemateId =
		bank.row.housemate_id === null ? undefined : String(bank.row.housemate_id);
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
	await applyConfirmReceipt(tx, {
		transactionId: input.transactionId,
		housemateId,
		allocations: suggestion.allocations,
		expectedRevision: input.expectedRevision,
		reason: input.reason,
	});
}
