import { paidPercentage } from "../../lib/payment-progress";
import type { ShareCover } from "./bill-reminder-credit";

export interface PayShare {
	amountOwed: number;
	amountPaid: number;
	remainingAmount: number;
	coveredAmount: number;
	remainingAfterCredit: number;
	isOverdue: boolean;
}

const OWING_THRESHOLD = 0.009;

function dollars(cents: number) {
	return cents / 100;
}

function sum(items: PayShare[], pick: (item: PayShare) => number) {
	return items.reduce((total, item) => total + pick(item), 0);
}

export function toPayShare(
	share: ShareCover & { amountOwed: number; amountPaid: number },
	isOverdue: boolean,
): PayShare {
	return {
		amountOwed: share.amountOwed,
		amountPaid: share.amountPaid,
		remainingAmount: Math.max(0, share.amountOwed - share.amountPaid),
		coveredAmount: dollars(share.coveredCents),
		remainingAfterCredit: dollars(share.leftCents),
		isOverdue,
	};
}

export function isOwing(item: Pick<PayShare, "remainingAfterCredit">) {
	return item.remainingAfterCredit > OWING_THRESHOLD;
}

// Counts and totals for the pay page after credit is applied, so the badge,
// the headline and the progress bar all describe the same bills.
export function buildPaySummary(items: PayShare[], heldAmount: number) {
	const owing = items.filter(isOwing);
	const totalAmount = sum(items, (item) => item.amountOwed);
	const remainingAmount = sum(owing, (item) => item.remainingAfterCredit);
	const settledAmount = Math.max(0, totalAmount - remainingAmount);
	return {
		summary: {
			billCount: owing.length,
			overdueCount: owing.filter((item) => item.isOverdue).length,
			remainingAmount,
			overdueAmount: sum(
				owing.filter((item) => item.isOverdue),
				(item) => item.remainingAfterCredit,
			),
		},
		paymentProgress: {
			settledAmount,
			percentage: paidPercentage(settledAmount, totalAmount),
		},
		credit: {
			heldAmount,
			appliedAmount: sum(items, (item) => item.coveredAmount),
		},
	};
}
