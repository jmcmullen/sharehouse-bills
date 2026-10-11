import type { Row } from "@libsql/client";
import { exactBankShare, getAccountPayments } from "./account-payments";
import { voidReceipts } from "./allocate";
import { enqueuePaymentArrived } from "./arrival-notifications";
import {
	type Classification,
	confirmTransaction,
	isSettledExternalAud,
	receivedAt,
	setDecision,
} from "./bank-decision";
import { loadHousemates } from "./housemates";
import {
	type BankTransaction,
	bankReference,
	bankTransactionSchema,
	identifyHousemate,
	isHouseholdReference,
	namedBeneficiaries,
} from "./model";
import { ignoredBankReason } from "./review-policy";
import { type Executor, nowSeconds } from "./transaction";

// The webhook's ingest: a transfer left in review tells the owner money has
// arrived. The history import ingests without telling anyone.
export async function receiveBankTransaction(
	tx: Executor,
	input: unknown,
): Promise<void> {
	const id = await ingestBankTransaction(tx, input);
	await enqueuePaymentArrived(tx, id);
}

// Upserts the bank's view of a transaction and returns its id. An automatic
// classification is redone every time, and a household transfer that exactly
// pays one open share confirms itself. A decision (admin or automatic)
// survives unless the money it rests on changed, in which case its receipts
// are voided and it goes back to review for the same housemate.
export async function ingestBankTransaction(
	tx: Executor,
	input: unknown,
): Promise<string> {
	const transaction = bankTransactionSchema.parse(input);
	const existing = (
		await tx.execute({
			sql: "SELECT * FROM bank_transactions WHERE id=?",
			args: [transaction.id],
		})
	).rows[0];
	await upsertBankColumns(tx, transaction);
	const amountCents = transaction.attributes.amount.valueInBaseUnits;
	if (existing && existing.decided_at !== null) {
		if (
			existing.decision === "confirmed" &&
			moneyChanged(existing, transaction)
		)
			await reopen(
				tx,
				{ id: transaction.id, amountCents },
				existing,
				"Bank transaction changed; review it again",
			);
		return transaction.id;
	}
	const classification = await classify(tx, transaction);
	if (!(await confirmAutomatically(tx, transaction, classification)))
		await setDecision(
			tx,
			{ id: transaction.id, amountCents },
			{ ...classification, decided: false },
		);
	return transaction.id;
}

// Confirms a settled AUD transfer from one identified housemate whose
// household reference exactly pays one open share. Anything less is left for
// review. Returns true when it confirmed.
async function confirmAutomatically(
	tx: Executor,
	transaction: BankTransaction,
	classification: Classification,
): Promise<boolean> {
	const amountCents = transaction.attributes.amount.valueInBaseUnits;
	const reference = bankReference(transaction);
	if (
		classification.decision !== "review" ||
		!classification.housemateId ||
		amountCents <= 0 ||
		!isSettledExternalAud(transaction) ||
		!isHouseholdReference(reference)
	)
		return false;
	const match = exactBankShare(
		await getAccountPayments(tx, classification.housemateId),
		{ amountCents, receivedAt: receivedAt(transaction), message: reference },
	);
	if (!match) return false;
	await confirmTransaction(tx, transaction, {
		housemateId: classification.housemateId,
		allocations: [match.allocation],
		note: "",
		reason: `Confirmed automatically: exact match for ${match.label}`,
	});
	return true;
}

// The bank removed the transaction. Money confirmed from it no longer exists.
export async function deleteBankTransaction(
	tx: Executor,
	transactionId: string,
): Promise<void> {
	const existing = (
		await tx.execute({
			sql: "SELECT * FROM bank_transactions WHERE id=?",
			args: [transactionId],
		})
	).rows[0];
	if (!existing) return;
	await tx.execute({
		sql: "UPDATE bank_transactions SET bank_status='DELETED',updated_at=max(updated_at+1,?) WHERE id=?",
		args: [nowSeconds(), transactionId],
	});
	if (existing.decision === "confirmed")
		await reopen(
			tx,
			{ id: transactionId, amountCents: Number(existing.amount_cents) },
			existing,
			"Bank transaction deleted; review it again",
		);
}

// Sends a confirmed transfer back to review. The row stays an admin decision
// so re-ingest never reclassifies a transfer the admin assigned by hand.
async function reopen(
	tx: Executor,
	transaction: { id: string; amountCents: number },
	existing: Row,
	reason: string,
): Promise<void> {
	await voidReceipts(tx, transaction.id, reason);
	await setDecision(tx, transaction, {
		decision: "review",
		housemateId:
			existing.housemate_id === null ? null : String(existing.housemate_id),
		reason,
		decided: true,
	});
}

function moneyChanged(existing: Row, transaction: BankTransaction): boolean {
	const attributes = transaction.attributes;
	return (
		Number(existing.amount_cents) !== attributes.amount.valueInBaseUnits ||
		existing.currency !== attributes.amount.currencyCode ||
		existing.bank_status !== attributes.status
	);
}

async function upsertBankColumns(
	tx: Executor,
	transaction: BankTransaction,
): Promise<void> {
	const attributes = transaction.attributes;
	await tx.execute({
		sql: `INSERT INTO bank_transactions(id,account_id,amount_cents,currency,bank_status,description,message,raw_text,effective_at,raw_data,imported_at,updated_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET account_id=excluded.account_id,amount_cents=excluded.amount_cents,currency=excluded.currency,bank_status=excluded.bank_status,description=excluded.description,message=excluded.message,raw_text=excluded.raw_text,effective_at=excluded.effective_at,raw_data=excluded.raw_data,updated_at=max(bank_transactions.updated_at+1,excluded.updated_at)`,
		args: [
			transaction.id,
			transaction.relationships?.account.data.id ?? null,
			attributes.amount.valueInBaseUnits,
			attributes.amount.currencyCode,
			attributes.status,
			attributes.description,
			attributes.message ?? "",
			attributes.rawText ?? "",
			receivedAt(transaction),
			JSON.stringify(transaction),
			nowSeconds(),
			nowSeconds(),
		],
	});
}

// Sorts a transfer for review or sets it aside. An identified housemate's
// money lands in review; ingest may then confirm it automatically.
async function classify(
	tx: Executor,
	transaction: BankTransaction,
): Promise<Classification> {
	const ignored = ignoredBankReason(transaction);
	if (ignored)
		return { decision: "excluded", housemateId: null, reason: ignored };
	const housemates = await loadHousemates(tx);
	const housemate = identifyHousemate(transaction, housemates);
	const historyStart = Number(
		(await tx.execute("SELECT min(created_at) AS start FROM bills")).rows[0]
			?.start ?? nowSeconds(),
	);
	if (receivedAt(transaction) < historyStart)
		return {
			decision: "archived",
			housemateId: housemate?.id ?? null,
			reason:
				"Before recorded bill history; reconcile historical charges first",
		};
	if (namedBeneficiaries(transaction, housemates).length > 1)
		return {
			decision: "review",
			housemateId: null,
			reason: "Multiple housemates named; choose an allocation",
		};
	if (!housemate)
		return {
			decision: "excluded",
			housemateId: null,
			reason: "No matching housemate; personal account activity",
		};
	const eligible =
		transaction.attributes.amount.valueInBaseUnits > 0 &&
		isSettledExternalAud(transaction);
	return {
		decision: "review",
		housemateId: housemate.id,
		reason: eligible
			? "Identified housemate; confirm the bills this payment covers"
			: "Review currency, settlement status, transfer or refund",
	};
}
