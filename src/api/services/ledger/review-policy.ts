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
	suggested: "Suggested match",
	unclear: "Needs a decision",
	shared: "Shared payment",
	outgoing: "Money out",
} as const;
export type ReviewGroup = keyof typeof reviewGroups;
// The stored group; "suggested" is derived at read time from the live suggestion.
type StoredReviewGroup = Exclude<ReviewGroup, "suggested">;

export function reviewGroupFor(facts: {
	amountCents: number;
	housemateId: string | null;
}): StoredReviewGroup {
	if (facts.amountCents < 0) return "outgoing";
	if (facts.housemateId === null) return "shared";
	return "unclear";
}

// payment_rows exposes `suggested` for rows whose live suggestion is exact or a combination.
export const reviewGroupSql = `CASE
WHEN suggested THEN 'suggested'
ELSE coalesce(review_group,'unclear') END`;

export function reviewHint(payment: {
	group: ReviewGroup;
	message: string;
	shared: boolean;
	matchCandidate: boolean;
	suggestion: { reason: string } | null;
}): string {
	if (payment.group === "outgoing")
		return "Money sent: confirm whether this was a household refund";
	if (payment.group === "shared")
		return payment.shared
			? "Shared payment: choose how much belongs to each housemate"
			: "Choose the housemate this payment belongs to";
	if (payment.matchCandidate)
		return "Possibly recorded already: compare with the manual payments";
	if (payment.suggestion) return payment.suggestion.reason;
	if (!payment.message.trim()) return "No payment reference";
	if (/\b(dinner|food|bali|present)\b/i.test(payment.message))
		return "Suggested: not a household payment";
	return "No open bill matches; keep as credit or choose bills";
}
