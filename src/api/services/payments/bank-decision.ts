import { getAccountPayments } from "./account-payments";
import {
	type BillAllocations,
	insertReceipt,
	voidReceipts,
	writeAllocations,
} from "./allocate";
import { requireHousemate } from "./housemates";
import type { BankTransaction } from "./model";
import {
	enqueuePaymentReceipt,
	paymentReceiptKind,
} from "./receipt-notifications";
import { reviewGroupFor } from "./review-policy";
import { type Executor, nowSeconds } from "./transaction";

type Decision = "review" | "confirmed" | "excluded" | "archived";
export interface Classification {
	decision: Decision;
	housemateId: string | null;
	reason: string;
}
interface Confirmation {
	housemateId: string;
	allocations: BillAllocations;
	note: string;
	reason: string;
}

export function receivedAt(transaction: BankTransaction): number {
	return Math.floor(
		Date.parse(
			transaction.attributes.settledAt ?? transaction.attributes.createdAt,
		) / 1000,
	);
}

export function isSettledExternalAud(transaction: BankTransaction): boolean {
	return (
		transaction.attributes.status === "SETTLED" &&
		transaction.attributes.amount.currencyCode === "AUD" &&
		!transaction.relationships?.transferAccount?.data
	);
}

// Records an admin decision (decided_at set) or an automatic classification
// (decided_at null), with the review group the queue sorts by.
export async function setDecision(
	tx: Executor,
	transaction: { id: string; amountCents: number },
	input: Classification & { decided: boolean },
): Promise<void> {
	await tx.execute({
		sql: "UPDATE bank_transactions SET decision=?,housemate_id=?,reason=?,review_group=?,decided_at=?,updated_at=max(updated_at+1,?) WHERE id=?",
		args: [
			input.decision,
			input.housemateId,
			input.reason,
			reviewGroupFor({
				amountCents: transaction.amountCents,
				housemateId: input.housemateId,
			}),
			input.decided ? nowSeconds() : null,
			nowSeconds(),
			transaction.id,
		],
	});
}

// One receipt for the housemate, its bills allocated in the same transaction,
// the decision recorded and the housemate's receipt queued. The admin's confirm
// and ingest's automatic confirmation both come through here. Empty
// allocations keep the money as credit on purpose. Re-confirming the same
// money for the same housemate keeps its receipt, so the housemate hears a
// correction rather than a second receipt.
export async function confirmTransaction(
	tx: Executor,
	transaction: BankTransaction,
	input: Confirmation,
): Promise<void> {
	const amountCents = transaction.attributes.amount.valueInBaseUnits;
	if (amountCents <= 0)
		throw new Error("Only money received can be confirmed against bills");
	const housemateId = await requireHousemate(tx, input.housemateId);
	const receiptId =
		(await keptReceipt(tx, transaction, housemateId, input.note)) ??
		(await replaceReceipts(tx, transaction, housemateId, input.note));
	await writeAllocations(
		tx,
		await getAccountPayments(tx, housemateId),
		receiptId,
		input.allocations,
	);
	await setDecision(
		tx,
		{ id: transaction.id, amountCents },
		{
			decision: "confirmed",
			housemateId,
			reason: input.reason,
			decided: true,
		},
	);
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
	transaction: BankTransaction,
	housemateId: string,
	note: string,
): Promise<string | null> {
	const live = (
		await tx.execute({
			sql: "SELECT id,housemate_id,amount_cents FROM receipts WHERE bank_transaction_id=? AND voided_at IS NULL",
			args: [transaction.id],
		})
	).rows;
	const [receipt] = live;
	if (
		live.length !== 1 ||
		String(receipt.housemate_id) !== housemateId ||
		Number(receipt.amount_cents) !==
			transaction.attributes.amount.valueInBaseUnits
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
	transaction: BankTransaction,
	housemateId: string,
	note: string,
): Promise<string> {
	await voidReceipts(tx, transaction.id, "Replaced by a new decision");
	return insertReceipt(tx, {
		housemateId,
		amountCents: transaction.attributes.amount.valueInBaseUnits,
		receivedAt: receivedAt(transaction),
		kind: "bank",
		bankTransactionId: transaction.id,
		note,
	});
}
