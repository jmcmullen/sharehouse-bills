import type { Share } from "./account/account";
import { sum } from "./account/compute";

type UnpaidShare = Pick<
	Share,
	"billId" | "name" | "billType" | "dueAt" | "leftCents"
>;
interface UnpaidBillLine {
	billId: string;
	billerName: string;
	remainingCents: number;
	billCount: number;
	dueAt: number;
}

function billGroup(bill: Pick<UnpaidShare, "billId" | "name" | "billType">) {
	if (bill.billType === "electricity")
		return { key: "utility:electricity", label: "Electricity" };
	if (bill.billType === "gas") return { key: "utility:gas", label: "Gas" };
	return { key: `bill:${bill.billId}`, label: bill.name };
}

function groupBy<T>(items: T[], key: (item: T) => string): T[][] {
	return [
		...items
			.reduce(
				(groups, item) =>
					new Map(groups).set(key(item), [
						...(groups.get(key(item)) ?? []),
						item,
					]),
				new Map<string, T[]>(),
			)
			.values(),
	];
}

// Every bill with money still to pay after credit across the house, with
// electricity and gas bills folded into one line each, oldest due first.
export function summarizeUnpaidBills(shares: UnpaidShare[]) {
	const open = groupBy(shares, (share) => share.billId)
		.map((group) => ({
			...group[0],
			leftCents: sum(group, (share) => share.leftCents),
		}))
		.filter((bill) => bill.leftCents > 0)
		.sort((left, right) => left.dueAt - right.dueAt);
	const bills: UnpaidBillLine[] = groupBy(
		open,
		(bill) => billGroup(bill).key,
	).map((group) => ({
		billId: group[0].billId,
		billerName: billGroup(group[0]).label,
		remainingCents: sum(group, (bill) => bill.leftCents),
		billCount: group.length,
		dueAt: group[0].dueAt,
	}));
	return {
		bills,
		totalOutstandingCents: sum(open, (bill) => bill.leftCents),
	};
}
