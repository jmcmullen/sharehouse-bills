import { formatCents } from "../../../lib/money";
import type { Account, Receipt, Share } from "./account";
import { sydneyDate } from "./compute";

export type StatementStatus = "paid" | "part" | "covered" | "overdue" | "due";
export interface StatementBill {
	kind: "bill";
	id: string;
	at: number;
	name: string;
	amountCents: number;
	leftCents: number;
	creditCents: number;
	status: StatementStatus;
	payments: Array<{ label: string; at: number; amountCents: number }>;
	// Admin statement only: the account balance after this item.
	balanceCents?: number;
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
	// Admin statement only: a receipt a later decision voided, and the
	// account balance after this item.
	voided?: boolean;
	balanceCents?: number;
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

const TIME_ZONE = "Australia/Sydney";

function monthKey(seconds: number) {
	return sydneyDate(seconds).slice(0, 7);
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
	return new Date(Date.UTC(year, month - 1 + by, 1)).toISOString().slice(0, 7);
}

function receiptLabel(receipt: Receipt) {
	if (receipt.amountCents < 0) return "Refund sent";
	return receipt.kind === "cash" ? "Cash received" : "Payment received";
}

function shareStatus(share: Share): StatementStatus {
	if (share.remainingCents <= 0) return "paid";
	if (share.coveredCents > 0 && share.leftCents <= 0) return "covered";
	if (share.overdue) return "overdue";
	return share.paidCents > 0 || share.coveredCents > 0 ? "part" : "due";
}

function paymentNote(
	bills: StatementPayment["bills"],
	heldCents: number,
	receipt: Receipt,
	voided: boolean,
) {
	if (voided) return `Voided: ${receipt.voidReason ?? "corrected"}`;
	if (receipt.amountCents < 0) return "Refunded to the housemate";
	const covered = bills.map((bill) =>
		bill.at === null ? bill.name : `${bill.name} ${shortDate(bill.at)}`,
	);
	if (!covered.length) return "Held as credit";
	const note = `Covered ${covered.join(", ")}`;
	return heldCents > 0
		? `${note}, ${formatCents(heldCents)} held as credit`
		: note;
}

function toBillItems(shares: Share[], paid: Receipt[]): StatementBill[] {
	return shares.map((share) => ({
		kind: "bill",
		id: `bill-${share.id}`,
		at: share.dueAt,
		name: share.name,
		amountCents: share.amountCents,
		leftCents: share.leftCents,
		creditCents: share.coveredCents,
		status: shareStatus(share),
		payments: share.payments.flatMap((payment) => {
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
	}));
}

function toPaymentItems(
	shares: Share[],
	paid: Receipt[],
	voided: boolean,
): StatementPayment[] {
	return paid.map((receipt, index) => {
		const bills = receipt.allocations.map((allocation) => {
			const share = shares.find((item) => item.id === allocation.debtId);
			return {
				name: share?.name ?? "Removed bill",
				at: share?.dueAt ?? null,
				amountCents: allocation.amountCents,
			};
		});
		const heldCents = voided ? 0 : Math.max(0, receipt.unallocatedCents);
		const item: StatementPayment = {
			kind: "payment",
			id: `${voided ? "voided" : "payment"}-${receipt.receivedAt}-${index}`,
			at: receipt.receivedAt,
			label: receiptLabel(receipt),
			amountCents: receipt.amountCents,
			heldCents,
			note: paymentNote(bills, heldCents, receipt, voided),
			bills,
		};
		return voided ? { ...item, voided } : item;
	});
}

// Running balance oldest first: shares add what is owed, live receipts take
// away what was paid. Voided receipts leave it unchanged.
function withBalances(items: StatementItem[]): StatementItem[] {
	const ordered = [...items].sort(
		(a, b) => a.at - b.at || a.id.localeCompare(b.id),
	);
	const balances = new Map(
		ordered.map((item, index) => [
			item.id,
			ordered
				.slice(0, index + 1)
				.reduce((total, entry) => total + balanceChange(entry), 0),
		]),
	);
	return items.map((item) => ({
		...item,
		balanceCents: balances.get(item.id) ?? 0,
	}));
}

function balanceChange(item: StatementItem): number {
	if (item.kind === "bill") return item.amountCents;
	return item.voided ? 0 : -item.amountCents;
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

interface StatementOptions {
	recentMonths?: number;
	// The admin statement: refunds, a running balance, and these voided
	// receipts as corrections.
	admin?: { voided: Receipt[] };
}

// The housemate's statement: bill shares and the money that paid them on one
// timeline, grouped by Sydney month, newest first. Recent months show by
// default; older months wait behind "Show earlier". Bills covered by credit
// use the account's cover, so the statement and the pay page always agree.
export function buildStatement(
	account: Pick<Account, "shares" | "receipts">,
	now: number,
	{ recentMonths = 3, admin }: StatementOptions = {},
): StatementTimeline {
	const paid = account.receipts.filter((receipt) => receipt.amountCents > 0);
	const items = [
		...toBillItems(account.shares, paid),
		...toPaymentItems(account.shares, admin ? account.receipts : paid, false),
		...(admin ? toPaymentItems(account.shares, admin.voided, true) : []),
	];
	const months = groupByMonth(admin ? withBalances(items) : items);
	const cutoff = shiftMonth(monthKey(now), 1 - recentMonths);
	return {
		recent: months.filter((month) => month.key >= cutoff),
		earlier: months.filter((month) => month.key < cutoff),
	};
}
