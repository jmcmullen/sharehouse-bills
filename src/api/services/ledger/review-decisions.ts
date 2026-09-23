import type { Client, Row } from "@libsql/client";
import { z } from "zod";
import {
	clearBankPosting,
	clearSplitPosting,
	isSettledExternalAud,
	postBankDecision,
	setBankDecision,
} from "./bank-decisions";
import { type BankTransaction, bankTransactionSchema } from "./model";
import { linkPaymentEvidence } from "./payment-evidence";
import { ignoredBankReason } from "./review-policy";
import {
	type Executor,
	applySource,
	loadHousemates,
	withWriteTransaction,
} from "./sources";
import { postSplitPayment, requireSeparatePaymentNote } from "./split-payments";

export const reviewDecisionSchema = z.object({
	transactionId: z.string().min(1),
	action: z.enum(["credit", "exclude", "link", "split"]),
	allocations: z
		.array(
			z.object({
				housemateId: z.string().min(1),
				amountCents: z.number().int().positive().safe(),
			}),
		)
		.min(2)
		.max(10)
		.optional(),
	housemateId: z.string().min(1).optional(),
	manualSourceKey: z.string().min(1).optional(),
	manualSourceKeys: z.array(z.string().min(1)).min(1).max(50).optional(),
	reason: z.string().trim().max(1000).default(""),
	expectedRevision: z.number().int().optional(),
});
type ReviewDecision = z.infer<typeof reviewDecisionSchema>;

export const batchReviewSchema = z
	.array(reviewDecisionSchema.extend({ expectedRevision: z.number().int() }))
	.min(1)
	.max(10);

export async function reviewBankTransaction(
	client: Client,
	input: ReviewDecision,
): Promise<void> {
	const decision = reviewDecisionSchema.parse(input);
	await withWriteTransaction(client, (tx) => applyReviewDecision(tx, decision));
}

export async function reviewBankTransactions(
	client: Client,
	input: z.infer<typeof batchReviewSchema>,
): Promise<void> {
	const decisions = batchReviewSchema.parse(input);
	if (
		new Set(decisions.map((item) => item.transactionId)).size !==
		decisions.length
	)
		throw new Error("Select each payment only once");
	await withWriteTransaction(client, async (tx) => {
		for (const decision of decisions) await applyReviewDecision(tx, decision);
	});
}

async function applyReviewDecision(
	tx: Executor,
	input: ReviewDecision,
): Promise<void> {
	const reason = input.reason || defaultReviewReason(input.action);
	const bank = (
		await tx.execute({
			sql: "SELECT * FROM ledger_bank_transactions WHERE id=?",
			args: [input.transactionId],
		})
	).rows[0];
	if (!bank) throw new Error("Bank transaction not found");
	if (
		input.expectedRevision !== undefined &&
		input.expectedRevision !== Number(bank.updated_at)
	)
		throw new Error(
			"This payment changed since you opened it. Refresh and review it again.",
		);
	const transaction = bankTransactionSchema.parse(
		JSON.parse(String(bank.raw_data)),
	);
	if (input.action === "exclude") {
		await clearBankPosting(tx, transaction.id);
		await setBankDecision(tx, transaction, {
			decision: "exclude",
			housemateId:
				bank.housemate_id === null ? null : String(bank.housemate_id),
			origin: "review",
			reason,
		});
		return;
	}
	validateReviewPosting(bank, transaction, input);
	if (input.action === "split") {
		await postSplitPayment(tx, transaction, input.allocations, reason);
		return;
	}
	const housemate = (await loadHousemates(tx)).find(
		(housemate) => housemate.id === input.housemateId && !housemate.isOwner,
	);
	if (!housemate) throw new Error("Select a non-owner housemate");
	if (!isSettledExternalAud(transaction))
		throw new Error("Only settled external AUD transactions can be posted");
	if (input.action === "credit")
		await requireSeparatePaymentNote(
			tx,
			transaction,
			housemate.id,
			transaction.attributes.amount.valueInBaseUnits,
			input.reason,
		);
	if (input.action === "link") {
		await linkManualPayment(tx, transaction, input, housemate.id, reason);
		return;
	}
	await clearSplitPosting(tx, transaction.id);
	await tx.execute({
		sql: "DELETE FROM ledger_payment_evidence WHERE transaction_id=?",
		args: [transaction.id],
	});
	await setBankDecision(tx, transaction, {
		decision: "credit",
		housemateId: housemate.id,
		origin: "review",
		reason,
	});
	await postBankDecision(tx, transaction, housemate.id);
}

function validateReviewPosting(
	bank: Row,
	transaction: BankTransaction,
	input: ReviewDecision,
): void {
	if (
		input.action === "credit" &&
		transaction.attributes.amount.valueInBaseUnits < 0 &&
		input.reason.trim().length < 5
	)
		throw new Error("Add a note explaining the household refund");
	if (bank.bank_status === "DELETED")
		throw new Error("Deleted bank transactions cannot be credited or linked");
	if (ignoredBankReason(transaction))
		throw new Error(
			"Own-account movements, interest and merchant refunds cannot be housemate payments",
		);
	if (bank.decision === "archive" && input.reason.length < 5)
		throw new Error("Explain the historical charges this payment covers");
	if (
		["credit", "split"].includes(input.action) &&
		bank.review_group === "duplicate" &&
		input.reason.length < 5
	)
		throw new Error(
			"Link the existing payment or explain why this is a separate payment",
		);
}

async function linkManualPayment(
	tx: Executor,
	transaction: BankTransaction,
	decision: ReviewDecision,
	housemateId: string,
	reason: string,
): Promise<void> {
	const keys =
		decision.manualSourceKeys ??
		(decision.manualSourceKey ? [decision.manualSourceKey] : []);
	await linkPaymentEvidence(tx, transaction, housemateId, keys);
	await clearSplitPosting(tx, transaction.id);
	await applySource(tx, `bank:${transaction.id}`, null);
	await setBankDecision(tx, transaction, {
		decision: "linked",
		housemateId,
		origin: "review",
		reason,
		link: keys.length === 1 ? keys[0] : null,
	});
}

function defaultReviewReason(action: ReviewDecision["action"]): string {
	if (action === "exclude") return "Not a household payment";
	if (action === "link") return "Linked to existing manual payment";
	if (action === "split")
		return "Payment allocation confirmed by administrator";
	return "Household payment confirmed by administrator";
}
