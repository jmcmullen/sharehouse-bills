import type { BankTransaction, LedgerSource } from "./model";
import { type ReviewGroup, reviewGroupFor } from "./review-policy";
import { type Executor, applySource, nowSeconds } from "./sources";

interface BankDecision {
	decision: "credit" | "exclude" | "review" | "archive" | "linked";
	housemateId: string | null;
	origin: "automatic" | "review";
	reason: string;
	link?: string | null;
	duplicate?: boolean;
}

export function bankSource(
	transaction: BankTransaction,
	housemateId: string,
): LedgerSource {
	return {
		housemateId,
		amountCents: -transaction.attributes.amount.valueInBaseUnits,
		kind:
			transaction.attributes.amount.valueInBaseUnits >= 0
				? "payment"
				: "refund",
		description: [
			transaction.attributes.description,
			transaction.attributes.message,
		]
			.filter(Boolean)
			.join(" · "),
		billId: null,
		effectiveAt: receivedAt(transaction),
		dueAt: null,
	};
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

export async function setBankDecision(
	tx: Executor,
	transaction: BankTransaction,
	input: BankDecision,
): Promise<void> {
	const group: ReviewGroup = reviewGroupFor({
		amountCents: transaction.attributes.amount.valueInBaseUnits,
		duplicate: input.duplicate ?? false,
		housemateId: input.housemateId,
	});
	await tx.execute({
		sql: "UPDATE ledger_bank_transactions SET decision=?,housemate_id=?,decision_origin=?,reason=?,review_group=?,linked_source_key=?,updated_at=max(updated_at+1,?) WHERE id=?",
		args: [
			input.decision,
			input.housemateId,
			input.origin,
			input.reason,
			group,
			input.link ?? null,
			nowSeconds(),
			transaction.id,
		],
	});
}

export async function postBankDecision(
	tx: Executor,
	transaction: BankTransaction,
	housemateId: string,
): Promise<void> {
	if (!isSettledExternalAud(transaction)) {
		await clearBankPosting(tx, transaction.id);
		await setBankDecision(tx, transaction, {
			decision: "review",
			housemateId,
			origin: "review",
			reason:
				"Previously credited bank transaction changed; recheck settlement and currency",
		});
		return;
	}
	await applySource(
		tx,
		`bank:${transaction.id}`,
		bankSource(transaction, housemateId),
	);
}

export async function clearSplitPosting(
	tx: Executor,
	id: string,
): Promise<void> {
	const allocations = (
		await tx.execute({
			sql: "SELECT housemate_id FROM ledger_bank_allocations WHERE transaction_id=?",
			args: [id],
		})
	).rows;
	for (const allocation of allocations)
		await applySource(tx, `bank:${id}:${allocation.housemate_id}`, null);
	await tx.execute({
		sql: "DELETE FROM ledger_bank_allocations WHERE transaction_id=?",
		args: [id],
	});
}

export async function clearBankPosting(
	tx: Executor,
	id: string,
): Promise<void> {
	await tx.execute({
		sql: "DELETE FROM ledger_payment_evidence WHERE transaction_id=?",
		args: [id],
	});
	await clearSplitPosting(tx, id);
	await applySource(tx, `bank:${id}`, null);
}
