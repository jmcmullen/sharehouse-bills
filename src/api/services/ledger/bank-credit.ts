import type { Row } from "@libsql/client";
import {
	clearSplitPosting,
	isSettledExternalAud,
	postBankDecision,
	setBankDecision,
} from "./bank-decisions";
import { type BankTransaction, bankTransactionSchema } from "./model";
import { ignoredBankReason } from "./review-policy";
import { type Executor, loadHousemates } from "./sources";
import { requireSeparatePaymentNote } from "./split-payments";

export interface BankRow {
	row: Row;
	transaction: BankTransaction;
}

// Loads the stored bank transaction and rejects decisions made from a stale view.
export async function loadBankRow(
	tx: Executor,
	transactionId: string,
	expectedRevision: number | undefined,
): Promise<BankRow> {
	const row = (
		await tx.execute({
			sql: "SELECT * FROM ledger_bank_transactions WHERE id=?",
			args: [transactionId],
		})
	).rows[0];
	if (!row) throw new Error("Bank transaction not found");
	if (
		expectedRevision !== undefined &&
		expectedRevision !== Number(row.updated_at)
	)
		throw new Error(
			"This payment changed since you opened it. Refresh and review it again.",
		);
	return {
		row,
		transaction: bankTransactionSchema.parse(JSON.parse(String(row.raw_data))),
	};
}

export function validateReviewPosting(
	bank: BankRow,
	input: { action: string; reason: string },
): void {
	const amount = bank.transaction.attributes.amount.valueInBaseUnits;
	if (input.action === "credit" && amount < 0 && input.reason.trim().length < 5)
		throw new Error("Add a note explaining the household refund");
	if (bank.row.bank_status === "DELETED")
		throw new Error("Deleted bank transactions cannot be credited or linked");
	if (ignoredBankReason(bank.transaction))
		throw new Error(
			"Own-account movements, interest and merchant refunds cannot be housemate payments",
		);
	if (bank.row.decision === "archive" && input.reason.length < 5)
		throw new Error("Explain the historical charges this payment covers");
}

export async function requireHousemate(
	tx: Executor,
	housemateId: string | undefined,
): Promise<string> {
	const housemate = (await loadHousemates(tx)).find(
		(item) => item.id === housemateId && !item.isOwner,
	);
	if (!housemate) throw new Error("Select a non-owner housemate");
	return housemate.id;
}

// Credits the whole transaction to one housemate as an explicit decision,
// clearing any split or manual-payment link it carried before. `note` is the
// admin's own words; the stored reason falls back to a default.
export async function creditBankTransaction(
	tx: Executor,
	bank: BankRow,
	housemateId: string,
	note: string,
): Promise<void> {
	const transaction = bank.transaction;
	if (!isSettledExternalAud(transaction))
		throw new Error("Only settled external AUD transactions can be posted");
	await requireSeparatePaymentNote(
		tx,
		transaction,
		housemateId,
		transaction.attributes.amount.valueInBaseUnits,
		note,
	);
	await clearSplitPosting(tx, transaction.id);
	await tx.execute({
		sql: "DELETE FROM ledger_payment_evidence WHERE transaction_id=?",
		args: [transaction.id],
	});
	await setBankDecision(tx, transaction, {
		decision: "credit",
		housemateId,
		origin: "review",
		reason: note || "Household payment confirmed by administrator",
	});
	await postBankDecision(tx, transaction, housemateId);
}
