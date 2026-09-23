import type { Row } from "@libsql/client";
import {
	bankSource,
	clearBankPosting,
	isSettledExternalAud,
	postBankDecision,
	receivedAt,
	setBankDecision,
} from "./bank-decisions";
import {
	type BankTransaction,
	bankTransactionSchema,
	hasHouseholdReference,
	identifyHousemate,
	namedBeneficiaries,
} from "./model";
import {
	possibleManualDuplicate,
	validPaymentEvidence,
} from "./payment-evidence";
import { ignoredBankReason } from "./review-policy";
import {
	type Executor,
	applySource,
	loadHousemates,
	nowSeconds,
} from "./sources";
import { preserveSplitPayment } from "./split-payments";

export async function ingestBankTransaction(
	tx: Executor,
	input: unknown,
): Promise<void> {
	const transaction = bankTransactionSchema.parse(input);
	const attributes = transaction.attributes;
	const existing = (
		await tx.execute({
			sql: "SELECT * FROM ledger_bank_transactions WHERE id=?",
			args: [transaction.id],
		})
	).rows[0];
	const effectiveAt = receivedAt(transaction);
	await tx.execute({
		sql: `INSERT INTO ledger_bank_transactions(id,account_id,amount_cents,currency,bank_status,description,message,raw_text,effective_at,raw_data,imported_at,updated_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET account_id=excluded.account_id,amount_cents=excluded.amount_cents,currency=excluded.currency,bank_status=excluded.bank_status,description=excluded.description,message=excluded.message,raw_text=excluded.raw_text,effective_at=excluded.effective_at,raw_data=excluded.raw_data,updated_at=max(ledger_bank_transactions.updated_at+1,excluded.updated_at)`,
		args: [
			transaction.id,
			transaction.relationships?.account.data.id ?? null,
			attributes.amount.valueInBaseUnits,
			attributes.amount.currencyCode,
			attributes.status,
			attributes.description,
			attributes.message ?? "",
			attributes.rawText ?? "",
			effectiveAt,
			JSON.stringify(transaction),
			nowSeconds(),
			nowSeconds(),
		],
	});
	if (existing && existing.decision_origin === "review") {
		await preserveReviewedDecision(tx, transaction, existing);
		return;
	}
	const ignored = ignoredBankReason(transaction);
	if (ignored) {
		await setBankDecision(tx, transaction, {
			decision: "exclude",
			housemateId: null,
			origin: "automatic",
			reason: ignored,
		});
		await clearBankPosting(tx, transaction.id);
		return;
	}
	const housemates = await loadHousemates(tx);
	const historyStart = Number(
		(await tx.execute("SELECT min(created_at) AS start FROM bills")).rows[0]
			?.start ?? nowSeconds(),
	);
	if (effectiveAt < historyStart) {
		await setBankDecision(tx, transaction, {
			decision: "archive",
			housemateId: identifyHousemate(transaction, housemates)?.id ?? null,
			origin: "automatic",
			reason:
				"Before recorded bill history; reconcile historical charges first",
		});
		await clearBankPosting(tx, transaction.id);
		return;
	}
	if (namedBeneficiaries(transaction, housemates).length > 1) {
		await setBankDecision(tx, transaction, {
			decision: "review",
			housemateId: null,
			origin: "automatic",
			reason: "Multiple housemates named; choose an allocation",
		});
		await clearBankPosting(tx, transaction.id);
		return;
	}
	const legacy = (
		await tx.execute({
			sql: "SELECT housemate_id,status,source FROM payment_transactions WHERE transaction_id=?",
			args: [transaction.id],
		})
	).rows[0];
	await classifyBankTransaction(
		tx,
		transaction,
		legacy,
		effectiveAt,
		existing?.decision === "credit",
	);
}

async function classifyBankTransaction(
	tx: Executor,
	transaction: BankTransaction,
	legacy: Row | undefined,
	effectiveAt: number,
	previouslyCredited: boolean,
): Promise<void> {
	const attributes = transaction.attributes;
	const housemates = await loadHousemates(tx);
	const housemate =
		legacy?.status === "matched" && legacy.housemate_id
			? (housemates.find(
					(item) => item.id === legacy.housemate_id && !item.isOwner,
				) ?? null)
			: identifyHousemate(transaction, housemates);
	const duplicate = housemate
		? await possibleManualDuplicate(
				tx,
				housemate.id,
				attributes.amount.valueInBaseUnits,
				effectiveAt,
			)
		: false;
	const eligible =
		housemate &&
		attributes.amount.valueInBaseUnits > 0 &&
		isSettledExternalAud(transaction);
	const referenced = hasHouseholdReference(transaction);
	const credit = eligible && referenced && (!duplicate || previouslyCredited);
	await setBankDecision(tx, transaction, {
		decision: credit ? "credit" : housemate ? "review" : "exclude",
		housemateId: housemate?.id ?? null,
		origin: "automatic",
		reason: automaticDecisionReason(
			duplicate,
			Boolean(housemate),
			Boolean(eligible),
			referenced,
		),
		duplicate,
	});
	await applySource(
		tx,
		`bank:${transaction.id}`,
		credit ? bankSource(transaction, housemate.id) : null,
	);
}

function automaticDecisionReason(
	duplicate: boolean,
	identified: boolean,
	eligible: boolean,
	referenced: boolean,
): string {
	if (duplicate)
		return "Possible existing manual payment: match the recorded payments before adding credit";
	if (!identified) return "No matching housemate; personal account activity";
	if (!eligible)
		return "Review currency, settlement status, transfer or refund";
	if (!referenced)
		return "Missing or unclear household payment purpose; approval required";
	return "Identified housemate and household reference; no exact bill match required";
}

async function preserveReviewedDecision(
	tx: Executor,
	transaction: BankTransaction,
	existing: Row,
): Promise<void> {
	const attributes = transaction.attributes;
	const housemateId =
		existing.housemate_id === null ? null : String(existing.housemate_id);
	if (existing.decision === "linked") {
		if (
			!(await validPaymentEvidence(tx, transaction, housemateId)) ||
			attributes.status !== "SETTLED" ||
			attributes.amount.currencyCode !== "AUD"
		) {
			await tx.execute({
				sql: "DELETE FROM ledger_payment_evidence WHERE transaction_id=?",
				args: [transaction.id],
			});
			await setBankDecision(tx, transaction, {
				decision: "review",
				housemateId,
				origin: "review",
				reason:
					"Linked manual payment or bank receipt changed; reconcile again",
			});
		}
	}
	if (existing.decision === "credit" && housemateId === null) {
		await preserveSplitPayment(tx, transaction);
		return;
	}
	if (existing.decision === "credit" && housemateId)
		await postBankDecision(tx, transaction, housemateId);
}

export async function deleteBankTransaction(
	tx: Executor,
	transactionId: string,
): Promise<void> {
	await clearBankPosting(tx, transactionId);
	await tx.execute({
		sql: `UPDATE ledger_bank_transactions SET bank_status='DELETED',
		decision=CASE WHEN decision IN ('credit','linked','review') THEN 'review' ELSE 'exclude' END,
		decision_origin=CASE WHEN decision IN ('credit','linked','review') THEN 'review' ELSE decision_origin END,
		reason=CASE WHEN decision IN ('credit','linked','review') THEN 'Bank transaction deleted; verify any linked manual payment' ELSE reason END,
		review_group=CASE WHEN amount_cents<0 THEN 'outgoing' WHEN housemate_id IS NULL THEN 'assignment' ELSE 'purpose' END,
		updated_at=max(updated_at+1,?) WHERE id=?`,
		args: [nowSeconds(), transactionId],
	});
}
