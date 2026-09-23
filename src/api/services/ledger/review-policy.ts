import type { BankTransaction } from "./model";

export function ignoredBankReason(transaction: BankTransaction): string | null {
	if (transaction.relationships?.transferAccount?.data)
		return "Own-account transfer; no housemate payment";
	if (transaction.attributes.transactionType === "Interest")
		return "Bank interest; no housemate payment";
	if (transaction.attributes.transactionType === "Refund")
		return "Merchant refund; review the original bill if shared";
	return null;
}

export const reviewGroups = {
	purpose: "Missing or unclear purpose",
	duplicate: "Already recorded?",
	assignment: "Choose housemate or split",
	outgoing: "Money out",
} as const;
export type ReviewGroup = keyof typeof reviewGroups;

export function reviewGroupFor(facts: {
	amountCents: number;
	duplicate: boolean;
	housemateId: string | null;
}): ReviewGroup {
	if (facts.amountCents < 0) return "outgoing";
	if (facts.duplicate) return "duplicate";
	if (facts.housemateId === null) return "assignment";
	return "purpose";
}

export const reviewGroupSql = `CASE
WHEN match_candidate THEN 'duplicate'
ELSE coalesce(review_group,'purpose') END`;

export function reviewHint(payment: {
	group: ReviewGroup;
	message: string;
	shared: boolean;
}): string {
	if (payment.group === "duplicate")
		return "Compare with the existing manual payment";
	if (payment.group === "outgoing")
		return "Money sent: confirm whether this was a household refund";
	if (payment.group === "assignment")
		return payment.shared
			? "Shared payment: choose how much belongs to each housemate"
			: "Choose the housemate this payment belongs to";
	if (!payment.message.trim()) return "No payment reference";
	if (/\b(dinner|food|bali|present)\b/i.test(payment.message))
		return "Suggested: not a household payment";
	return "Confirm what this payment was for";
}
