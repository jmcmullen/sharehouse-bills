import type { Client } from "@libsql/client";
import { z } from "zod";
import {
	type BankRow,
	creditBankTransaction,
	loadBankRow,
	requireHousemate,
	validateReviewPosting,
} from "./bank-credit";
import {
	clearBankPosting,
	clearSplitPosting,
	isSettledExternalAud,
	setBankDecision,
} from "./bank-decisions";
import {
	applyConfirmSuggested,
	confirmSuggestedSchema,
} from "./confirm-receipt";
import { linkPaymentEvidence } from "./payment-evidence";
import { type Executor, applySource, withWriteTransaction } from "./sources";
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
	.array(
		z.union([
			reviewDecisionSchema.extend({ expectedRevision: z.number().int() }),
			confirmSuggestedSchema,
		]),
	)
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
	input: z.input<typeof batchReviewSchema>,
): Promise<void> {
	const decisions = batchReviewSchema.parse(input);
	if (
		new Set(decisions.map((item) => item.transactionId)).size !==
		decisions.length
	)
		throw new Error("Select each payment only once");
	await withWriteTransaction(client, async (tx) => {
		for (const decision of decisions)
			await (decision.action === "confirm"
				? applyConfirmSuggested(tx, decision)
				: applyReviewDecision(tx, decision));
	});
}

async function applyReviewDecision(
	tx: Executor,
	input: ReviewDecision,
): Promise<void> {
	const reason = input.reason || defaultReviewReason(input.action);
	const bank = await loadBankRow(
		tx,
		input.transactionId,
		input.expectedRevision,
	);
	if (input.action === "exclude") {
		await clearBankPosting(tx, bank.transaction.id);
		await setBankDecision(tx, bank.transaction, {
			decision: "exclude",
			housemateId:
				bank.row.housemate_id === null ? null : String(bank.row.housemate_id),
			origin: "review",
			reason,
		});
		return;
	}
	validateReviewPosting(bank, input);
	if (input.action === "split") {
		if (bank.row.housemate_id !== null)
			await requireSeparatePaymentNote(
				tx,
				bank.transaction,
				String(bank.row.housemate_id),
				bank.transaction.attributes.amount.valueInBaseUnits,
				input.reason,
			);
		await postSplitPayment(tx, bank.transaction, input.allocations, reason);
		return;
	}
	const housemateId = await requireHousemate(tx, input.housemateId);
	if (input.action === "link") {
		await linkManualPayment(tx, bank, input, housemateId, reason);
		return;
	}
	await creditBankTransaction(tx, bank, housemateId, input.reason);
}

async function linkManualPayment(
	tx: Executor,
	bank: BankRow,
	decision: ReviewDecision,
	housemateId: string,
	reason: string,
): Promise<void> {
	if (!isSettledExternalAud(bank.transaction))
		throw new Error("Only settled external AUD transactions can be posted");
	const keys =
		decision.manualSourceKeys ??
		(decision.manualSourceKey ? [decision.manualSourceKey] : []);
	await linkPaymentEvidence(tx, bank.transaction, housemateId, keys);
	await clearSplitPosting(tx, bank.transaction.id);
	await applySource(tx, `bank:${bank.transaction.id}`, null);
	await setBankDecision(tx, bank.transaction, {
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
