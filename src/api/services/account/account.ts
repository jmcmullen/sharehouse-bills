import { isRentReference } from "../ledger/model";
import {
	type BillStatus,
	type ShareCover,
	balanceCents,
	billSettledAt,
	billStatus,
	coverShares,
	creditCents,
	isOverdue,
	overdueCents,
	owesCents,
	shareState,
	sum,
	upcomingCents,
} from "./compute";

type BillType =
	| "electricity"
	| "gas"
	| "internet"
	| "phone"
	| "water"
	| "other";

// A bill share as stored: what one housemate owes on one bill. Times are unix
// seconds throughout the module.
export interface ShareRow {
	id: string;
	billId: string;
	housemateId: string;
	isOwner: boolean;
	name: string;
	billType: BillType | null;
	category: string;
	stackGroup: string | null;
	recurringTemplateName: string | null;
	dueAt: number;
	billPeriodStart: number | null;
	billPeriodEnd: number | null;
	amountCents: number;
}
interface Allocation {
	debtId: string;
	amountCents: number;
}
// Money received from a housemate, with the shares it was allocated to.
export interface ReceiptRow {
	id: string;
	sourceKeys: string[];
	description: string;
	amountCents: number;
	receivedAt: number;
	receivedDateKnown: boolean;
	recordedAt: number;
	bankMatched: boolean;
	manual: boolean;
	cash: boolean;
	allocations: Allocation[];
}
export interface Share extends ShareRow, ShareCover {
	paidCents: number;
	remainingCents: number;
	settledAt: number | null;
	overdue: boolean;
	payments: Array<{ receiptId: string; amountCents: number }>;
}
export interface Receipt extends ReceiptRow {
	rentOnly: boolean;
	unallocatedCents: number;
}
export interface Housemate {
	id: string;
	name: string;
	isOwner: boolean;
}
export interface Account {
	housemate: Housemate;
	// Oldest due first, with held credit applied in that order.
	shares: Share[];
	// Newest first.
	receipts: Receipt[];
	remainingCents: number;
	creditCents: number;
	coveredCents: number;
	owesCents: number;
	overdueCents: number;
	upcomingCents: number;
	balanceCents: number;
}
export interface BillRow {
	id: string;
	name: string;
	totalCents: number;
	dueAt: number;
	billType: BillType | null;
	stackGroup: string | null;
	recurringTemplateName: string | null;
	billPeriodStart: number | null;
	billPeriodEnd: number | null;
}
interface BillShare extends Share {
	housemateName: string;
}
export interface Bill extends BillRow {
	shares: BillShare[];
	status: BillStatus;
	paidCents: number;
	remainingCents: number;
	settledAt: number | null;
}

function toShare(
	row: ShareRow,
	receipts: ReceiptRow[],
	now: number,
): Omit<Share, keyof ShareCover> {
	const payments = receipts.flatMap((receipt) =>
		receipt.allocations
			.filter((allocation) => allocation.debtId === row.id)
			.map((allocation) => ({
				receiptId: receipt.id,
				amountCents: allocation.amountCents,
				receivedAt: receipt.receivedAt,
			})),
	);
	return {
		...row,
		...shareState(row.amountCents, payments),
		overdue: isOverdue(row.dueAt, now),
		payments: payments.map(({ receiptId, amountCents }) => ({
			receiptId,
			amountCents,
		})),
	};
}

function toReceipt(row: ReceiptRow): Receipt {
	return {
		...row,
		rentOnly: isRentReference(row.description),
		unallocatedCents: creditCents([row]),
	};
}

export function buildAccount(input: {
	housemate: Housemate;
	shares: ShareRow[];
	receipts: ReceiptRow[];
	now: number;
}): Account {
	const credit = creditCents(input.receipts);
	const shares = coverShares(
		input.shares.map((row) => toShare(row, input.receipts, input.now)),
		credit,
	);
	return {
		housemate: input.housemate,
		shares,
		receipts: input.receipts
			.map(toReceipt)
			.sort((a, b) => b.receivedAt - a.receivedAt || a.id.localeCompare(b.id)),
		remainingCents: sum(shares, (share) => share.remainingCents),
		creditCents: credit,
		coveredCents: sum(shares, (share) => share.coveredCents),
		owesCents: owesCents(shares, credit),
		overdueCents: overdueCents(shares, input.now),
		upcomingCents: upcomingCents(shares, input.now),
		balanceCents: balanceCents(shares, input.receipts),
	};
}

// One bill with every housemate's share, read from their accounts so a share
// shows the same paid state and credit cover everywhere.
export function buildBill(row: BillRow, accounts: Account[]): Bill {
	const shares = accounts
		.flatMap((account) =>
			account.shares
				.filter((share) => share.billId === row.id)
				.map((share) => ({ ...share, housemateName: account.housemate.name })),
		)
		.sort((a, b) => a.housemateName.localeCompare(b.housemateName));
	return {
		...row,
		shares,
		status: billStatus(shares),
		paidCents: sum(shares, (share) => share.paidCents),
		remainingCents: sum(shares, (share) => share.remainingCents),
		settledAt: billSettledAt(shares),
	};
}

export function openShares(account: Pick<Account, "shares">): Share[] {
	return account.shares.filter((share) => share.remainingCents > 0);
}

// The bills page's totals across every bill.
export function summarizeBills(bills: Bill[]) {
	return {
		totalBills: bills.length,
		totalCents: sum(bills, (bill) => bill.totalCents),
		paidCents: sum(bills, (bill) => bill.paidCents),
		outstandingCents: sum(bills, (bill) => bill.remainingCents),
	};
}
