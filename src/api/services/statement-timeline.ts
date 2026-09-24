import { formatCurrency } from "../../lib/share-preview";
import type { ShareCover } from "./bill-reminder-credit";
import type { PayShare } from "./housemate-pay-summary";
import type { BillPaymentView, ReceiptView } from "./ledger/account-payments";
import { dayInSydney } from "./ledger/model";

export type BillStatus = "paid" | "part" | "covered" | "overdue" | "due";
export interface StatementBill {
	kind: "bill";
	id: string;
	at: number;
	name: string;
	amountCents: number;
	leftCents: number;
	creditCents: number;
	status: BillStatus;
	payments: Array<{ label: string; at: number; amountCents: number }>;
}
export interface StatementPayment {
	kind: "payment";
	id: string;
	at: number;
	label: string;
	amountCents: number;
	heldCents: number;
	note: string;
	bills: Array<{ name: string; at: number | null; amountCents: number }>;
}
type StatementItem = StatementBill | StatementPayment;
export interface StatementMonth {
	key: string;
	label: string;
	items: StatementItem[];
}
interface StatementTimeline {
	recent: StatementMonth[];
	earlier: StatementMonth[];
}
interface TimelineInput {
	bills: BillPaymentView[];
	receipts: ReceiptView[];
	// The pay page's per-share credit cover, keyed by the share's debt id.
	cover: Array<ShareCover & { debtId: string }>;
	now: number;
	recentMonths?: number;
}

const TIME_ZONE = "Australia/Sydney";

function monthKey(seconds: number) {
	return dayInSydney(seconds).slice(0, 7);
}

function monthLabel(key: string) {
	return new Intl.DateTimeFormat("en-AU", {
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	}).format(new Date(`${key}-01T00:00:00Z`));
}

function shortDate(seconds: number) {
	return new Intl.DateTimeFormat("en-AU", {
		day: "numeric",
		month: "short",
		timeZone: TIME_ZONE,
	}).format(new Date(seconds * 1000));
}

function shiftMonth(key: string, by: number) {
	const [year, month] = key.split("-").map(Number);
	const date = new Date(Date.UTC(year, month - 1 + by, 1));
	return date.toISOString().slice(0, 7);
}

function receiptLabel(receipt: ReceiptView) {
	return receipt.sourceKeys.some((key) => key.startsWith("manual:cash-"))
		? "Cash received"
		: "Payment received";
}

function billStatus(
	bill: BillPaymentView,
	cover: ShareCover | undefined,
	today: string,
): BillStatus {
	if (bill.remainingCents <= 0) return "paid";
	if (cover && cover.coveredCents > 0 && cover.leftCents <= 0) return "covered";
	if (bill.dueAt !== null && dayInSydney(bill.dueAt) < today) return "overdue";
	return bill.paidCents > 0 || (cover?.coveredCents ?? 0) > 0 ? "part" : "due";
}

function paymentNote(bills: StatementPayment["bills"], heldCents: number) {
	const covered = bills.map((bill) =>
		bill.at === null ? bill.name : `${bill.name} ${shortDate(bill.at)}`,
	);
	if (!covered.length) return "Held as credit";
	const note = `Covered ${covered.join(", ")}`;
	return heldCents > 0
		? `${note}, ${formatCurrency(heldCents / 100)} held as credit`
		: note;
}

function toBillItems(input: TimelineInput, paid: ReceiptView[]) {
	const today = dayInSydney(input.now);
	const cover = new Map(input.cover.map((share) => [share.debtId, share]));
	return input.bills
		.filter((bill) => bill.dueAt !== null)
		.map((bill): StatementBill => {
			const share = cover.get(bill.id);
			return {
				kind: "bill",
				id: `bill-${bill.id}`,
				at: bill.dueAt ?? 0,
				name: bill.name,
				amountCents: bill.amountCents,
				leftCents:
					bill.remainingCents <= 0
						? 0
						: (share?.leftCents ?? bill.remainingCents),
				creditCents: bill.remainingCents <= 0 ? 0 : (share?.coveredCents ?? 0),
				status: billStatus(bill, share, today),
				payments: bill.payments.flatMap((payment) => {
					const receipt = paid.find((item) => item.id === payment.receiptId);
					return receipt
						? [
								{
									label: receiptLabel(receipt),
									at: receipt.receivedAt,
									amountCents: payment.amountCents,
								},
							]
						: [];
				}),
			};
		});
}

function toPaymentItems(input: TimelineInput, paid: ReceiptView[]) {
	return paid.map((receipt, index): StatementPayment => {
		const bills = receipt.allocations.map((allocation) => {
			const bill = input.bills.find((item) => item.id === allocation.debtId);
			return {
				name: bill?.name ?? "Removed bill",
				at: bill?.dueAt ?? null,
				amountCents: allocation.amountCents,
			};
		});
		const heldCents = Math.max(0, receipt.unallocatedCents);
		return {
			kind: "payment",
			id: `payment-${receipt.receivedAt}-${index}`,
			at: receipt.receivedAt,
			label: receiptLabel(receipt),
			amountCents: receipt.amountCents,
			heldCents,
			note: paymentNote(bills, heldCents),
			bills,
		};
	});
}

function groupByMonth(items: StatementItem[]): StatementMonth[] {
	const sorted = [...items].sort(
		(a, b) => b.at - a.at || a.id.localeCompare(b.id),
	);
	const keys = [...new Set(sorted.map((item) => monthKey(item.at)))];
	return keys.map((key) => ({
		key,
		label: monthLabel(key),
		items: sorted.filter((item) => monthKey(item.at) === key),
	}));
}

// The housemate's statement: bill shares and the money that paid them on one
// timeline, grouped by Sydney month, newest first. Recent months show by
// default; older months wait behind "Show earlier". Bills covered by credit
// use the pay page's cover so the two pages always agree.
export function buildStatementTimeline(
	input: TimelineInput,
): StatementTimeline {
	const paid = input.receipts.filter((receipt) => receipt.amountCents > 0);
	const months = groupByMonth([
		...toBillItems(input, paid),
		...toPaymentItems(input, paid),
	]);
	const cutoff = shiftMonth(monthKey(input.now), 1 - (input.recentMonths ?? 3));
	return {
		recent: months.filter((month) => month.key >= cutoff),
		earlier: months.filter((month) => month.key < cutoff),
	};
}

// The pay page's headline for the whole account.
export function statementHeadline(input: {
	summary: Pick<PayShare, "remainingAmount">;
	credit: { heldAmount: number; appliedAmount: number };
}) {
	const spare = input.credit.heldAmount - input.credit.appliedAmount;
	if (input.summary.remainingAmount > 0.009)
		return { label: "You owe", amount: input.summary.remainingAmount };
	if (spare > 0.009) return { label: "In credit", amount: spare };
	if (input.credit.appliedAmount > 0.009)
		return { label: "All covered", amount: 0 };
	return { label: "All sorted", amount: 0 };
}
