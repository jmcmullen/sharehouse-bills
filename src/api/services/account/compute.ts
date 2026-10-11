// Every money derivation in the app, as pure functions over integer cents.
// The account loader feeds these; nothing else sums amounts.

export type BillStatus = "pending" | "partially_paid" | "paid";

interface Payment {
	amountCents: number;
	receivedAt: number;
}
interface PaidShare {
	isOwner: boolean;
	paidCents: number;
	remainingCents: number;
	settledAt: number | null;
}
interface OpenShare {
	id: string;
	dueAt: number;
	remainingCents: number;
}
// How much of a share the housemate's credit takes, and what is still to pay.
export interface ShareCover {
	coveredCents: number;
	leftCents: number;
}

const TIME_ZONE = "Australia/Sydney";
const sydneyDay = new Intl.DateTimeFormat("en-CA", {
	timeZone: TIME_ZONE,
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

export function sum<T>(items: T[], pick: (item: T) => number): number {
	return items.reduce((total, item) => total + pick(item), 0);
}

// The calendar day in Sydney as YYYY-MM-DD, so "overdue" follows the house's
// clock rather than UTC.
export function sydneyDate(seconds: number): string {
	return sydneyDay.format(new Date(seconds * 1000));
}

// Paid is what receipts allocated to the share; settled is when the last of
// that money arrived, and only once nothing remains.
export function shareState(amountCents: number, payments: Payment[]) {
	const paidCents = sum(payments, (payment) => payment.amountCents);
	const remainingCents = Math.max(0, amountCents - paidCents);
	const settledAt =
		remainingCents === 0 && payments.length
			? Math.max(...payments.map((payment) => payment.receivedAt))
			: null;
	return { paidCents, remainingCents, settledAt };
}

// A bill is paid when every share the owner does not carry is paid.
export function billStatus(shares: PaidShare[]): BillStatus {
	const owed = shares.filter((share) => !share.isOwner);
	if (owed.every((share) => share.remainingCents === 0)) return "paid";
	return owed.some((share) => share.paidCents > 0)
		? "partially_paid"
		: "pending";
}

// The day a bill was paid in full: when its last housemate share settled.
export function billSettledAt(shares: PaidShare[]): number | null {
	if (billStatus(shares) !== "paid") return null;
	const dates = shares.flatMap((share) =>
		!share.isOwner && share.settledAt !== null ? [share.settledAt] : [],
	);
	return dates.length ? Math.max(...dates) : null;
}

// Money received that no bill share has claimed yet.
export function creditCents(
	receipts: Array<{
		amountCents: number;
		allocations: Array<{ amountCents: number }>;
	}>,
): number {
	return sum(
		receipts,
		(receipt) =>
			receipt.amountCents -
			sum(receipt.allocations, (item) => item.amountCents),
	);
}

function byDue(left: OpenShare, right: OpenShare): number {
	return left.dueAt - right.dueAt || left.id.localeCompare(right.id);
}

// Applies held credit to open shares oldest due first, so every view agrees
// on which bills the money already received will settle.
export function coverShares<T extends OpenShare>(
	shares: T[],
	credit: number,
): Array<T & ShareCover> {
	return [...shares].sort(byDue).reduce<{
		left: number;
		rows: Array<T & ShareCover>;
	}>(
		(state, share) => {
			const coveredCents = Math.min(share.remainingCents, state.left);
			return {
				left: state.left - coveredCents,
				rows: [
					...state.rows,
					{
						...share,
						coveredCents,
						leftCents: share.remainingCents - coveredCents,
					},
				],
			};
		},
		{ left: Math.max(0, credit), rows: [] },
	).rows;
}

export function owesCents(
	shares: Array<{ remainingCents: number }>,
	credit: number,
): number {
	return Math.max(0, sum(shares, (share) => share.remainingCents) - credit);
}

// Everything charged less everything received. Only the admin statement shows it.
export function balanceCents(
	shares: Array<{ amountCents: number }>,
	receipts: Array<{ amountCents: number }>,
): number {
	return (
		sum(shares, (share) => share.amountCents) -
		sum(receipts, (receipt) => receipt.amountCents)
	);
}

export function isOverdue(dueAt: number, now: number): boolean {
	return sydneyDate(dueAt) < sydneyDate(now);
}

// Still to pay after credit on bills due before today in Sydney.
export function overdueCents(
	shares: Array<{ dueAt: number; leftCents: number }>,
	now: number,
): number {
	return sum(
		shares.filter((share) => isOverdue(share.dueAt, now)),
		(share) => share.leftCents,
	);
}

// Still unpaid on bills whose due date is ahead in Sydney time.
export function upcomingCents(
	shares: Array<{ dueAt: number; remainingCents: number }>,
	now: number,
): number {
	return sum(
		shares.filter((share) => sydneyDate(share.dueAt) > sydneyDate(now)),
		(share) => share.remainingCents,
	);
}

// Share of a total that has been paid, by amount. Rounds down so a bill a few
// cents short never reads as 100% until it is settled.
export function paidPercentage(settledCents: number, totalCents: number) {
	if (totalCents <= 0 || settledCents >= totalCents) return 100;
	return Math.max(
		0,
		Math.min(99, Math.floor((settledCents / totalCents) * 100)),
	);
}

export interface PayShare extends ShareCover {
	amountCents: number;
	paidCents: number;
	remainingCents: number;
	isOverdue: boolean;
}

// Counts and totals for a set of open shares after credit is applied, so the
// badge, the headline and the progress bar all describe the same bills.
export function buildPaySummary(items: PayShare[], heldCents: number) {
	const owing = items.filter((item) => item.leftCents > 0);
	const overdue = owing.filter((item) => item.isOverdue);
	const totalCents = sum(items, (item) => item.amountCents);
	const remainingCents = sum(owing, (item) => item.leftCents);
	const settledCents = Math.max(0, totalCents - remainingCents);
	return {
		summary: {
			billCount: owing.length,
			overdueCount: overdue.length,
			remainingCents,
			overdueCents: sum(overdue, (item) => item.leftCents),
		},
		paymentProgress: {
			settledCents,
			percentage: paidPercentage(settledCents, totalCents),
		},
		credit: {
			heldCents,
			appliedCents: sum(items, (item) => item.coveredCents),
		},
	};
}

// The housemate's headline for the whole account.
export function statementHeadline(input: {
	owesCents: number;
	creditCents: number;
	coveredCents: number;
}) {
	const spare = input.creditCents - input.coveredCents;
	if (input.owesCents > 0)
		return { label: "You owe", amountCents: input.owesCents };
	if (spare > 0) return { label: "In credit", amountCents: spare };
	if (input.coveredCents > 0) return { label: "All covered", amountCents: 0 };
	return { label: "All sorted", amountCents: 0 };
}
