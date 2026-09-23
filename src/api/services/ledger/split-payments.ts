import {
	bankSource,
	clearBankPosting,
	isSettledExternalAud,
	receivedAt,
	setBankDecision,
} from "./bank-decisions";
import type { BankTransaction } from "./model";
import { possibleManualDuplicate } from "./payment-evidence";
import { type Executor, applySource, loadHousemates } from "./sources";

interface SplitAllocation {
	housemateId: string;
	amountCents: number;
}

export async function requireSeparatePaymentNote(
	tx: Executor,
	transaction: BankTransaction,
	housemateId: string,
	amount: number,
	reason: string,
): Promise<void> {
	if (amount <= 0 || reason.trim().length >= 5) return;
	if (
		await possibleManualDuplicate(
			tx,
			housemateId,
			amount,
			receivedAt(transaction),
		)
	)
		throw new Error(
			"Match the recorded payments or explain why this is separate money",
		);
}

export async function postSplitPayment(
	tx: Executor,
	transaction: BankTransaction,
	allocations: SplitAllocation[] | undefined,
	reason: string,
): Promise<void> {
	if (!allocations || !isSettledExternalAud(transaction))
		throw new Error("Select allocations for a settled external AUD payment");
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
		transaction.attributes.amount.valueInBaseUnits
	)
		throw new Error("Allocations must equal the payment total");
	for (const allocation of allocations)
		await requireSeparatePaymentNote(
			tx,
			transaction,
			allocation.housemateId,
			allocation.amountCents,
			reason,
		);
	await clearBankPosting(tx, transaction.id);
	for (const allocation of allocations) {
		await tx.execute({
			sql: "INSERT INTO ledger_bank_allocations(transaction_id,housemate_id,amount_cents) VALUES (?,?,?)",
			args: [transaction.id, allocation.housemateId, allocation.amountCents],
		});
		await applySource(tx, `bank:${transaction.id}:${allocation.housemateId}`, {
			...bankSource(transaction, allocation.housemateId),
			amountCents: -allocation.amountCents,
		});
	}
	await setBankDecision(tx, transaction, {
		decision: "credit",
		housemateId: null,
		origin: "review",
		reason,
	});
}

export async function preserveSplitPayment(
	tx: Executor,
	transaction: BankTransaction,
): Promise<void> {
	const allocations = (
		await tx.execute({
			sql: "SELECT housemate_id,amount_cents FROM ledger_bank_allocations WHERE transaction_id=?",
			args: [transaction.id],
		})
	).rows;
	if (
		!isSettledExternalAud(transaction) ||
		allocations.length < 2 ||
		allocations.reduce((sum, row) => sum + Number(row.amount_cents), 0) !==
			transaction.attributes.amount.valueInBaseUnits
	) {
		await clearBankPosting(tx, transaction.id);
		await setBankDecision(tx, transaction, {
			decision: "review",
			housemateId: null,
			origin: "review",
			reason: "Shared payment changed; review allocations again",
		});
		return;
	}
	for (const allocation of allocations)
		await applySource(tx, `bank:${transaction.id}:${allocation.housemate_id}`, {
			...bankSource(transaction, String(allocation.housemate_id)),
			amountCents: -Number(allocation.amount_cents),
		});
}
