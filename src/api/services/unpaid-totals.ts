import type { bills } from "../db/schema/bills";
import type { ShareCover } from "./bill-reminder-credit";

type BillType = typeof bills.$inferSelect.billType;

interface BillShare extends ShareCover {
	billId: string;
	billerName: string;
	billType: BillType;
	dueDate: Date;
}

interface CurrentUnpaidBillSummary {
	billId: string;
	billerName: string;
	remainingAmount: number;
	billCount: number;
	sortDate: Date;
}

// What is still to pay once held credit has covered the oldest shares.
export function toPayCents(shares: ShareCover[]): number {
	return shares.reduce((sum, share) => sum + share.leftCents, 0);
}

export function overdueCents(
	shares: Array<ShareCover & { dueDate: Date }>,
	now: Date,
): number {
	return toPayCents(shares.filter((share) => share.dueDate < now));
}

// Every bill with money still to pay after credit, with electricity and gas
// bills folded into one line each, oldest due first.
export function summarizeUnpaidBills(shares: BillShare[]) {
	const open = [...groupBy(shares, (share) => share.billId).values()]
		.map((group) => ({
			...group[0],
			leftCents: toPayCents(group),
		}))
		.filter((bill) => bill.leftCents > 0)
		.sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime());
	const lines = [...groupBy(open, (bill) => billGroup(bill).key).values()].map(
		(group) => ({
			billId: group[0].billId,
			billerName: billGroup(group[0]).label,
			remainingAmount: toPayCents(group) / 100,
			billCount: group.length,
			sortDate: group[0].dueDate,
		}),
	);
	return {
		bills: lines satisfies CurrentUnpaidBillSummary[],
		totalOutstanding: toPayCents(open) / 100,
	};
}

function billGroup(
	bill: Pick<BillShare, "billId" | "billerName" | "billType">,
) {
	if (bill.billType === "electricity")
		return { key: "utility:electricity", label: "Electricity" };
	if (bill.billType === "gas") return { key: "utility:gas", label: "Gas" };
	return { key: `bill:${bill.billId}`, label: bill.billerName };
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
	return items.reduce(
		(groups, item) =>
			new Map(groups).set(key(item), [...(groups.get(key(item)) ?? []), item]),
		new Map<string, T[]>(),
	);
}
