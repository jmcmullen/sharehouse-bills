import type { Bill, Receipt } from "../account/account";
import { loadAccounts, loadBills } from "../account/account.server";
import { type BillStatus, sum } from "../account/compute";
import type { Executor } from "./transaction";

export interface ShareReceipt {
	receiptId: string;
	amountCents: number;
	description: string;
	receivedAt: number;
	kind: Receipt["kind"];
}
export interface BillShare {
	debtId: string;
	housemateId: string;
	housemateName: string;
	amountCents: number;
	paidCents: number;
	remainingCents: number;
	receipts: ShareReceipt[];
}
export type BillVerificationStatus = "paid" | "part" | "unpaid" | "check";
export interface VerifiedBill {
	id: string;
	name: string;
	category: string;
	dueAt: number | null;
	amountCents: number;
	paidCents: number;
	remainingCents: number;
	status: BillVerificationStatus;
	approved: boolean;
	needsLook: boolean;
	shares: BillShare[];
}
export interface BillVerificationSummary {
	paid: number;
	part: number;
	unpaid: number;
	check: number;
	approved: number;
	needsLook: number;
	remainingCents: number;
}
export interface BillVerification {
	bills: VerifiedBill[];
	summary: BillVerificationSummary;
}

const statusOf: Record<BillStatus, BillVerificationStatus> = {
	pending: "unpaid",
	partially_paid: "part",
	paid: "paid",
};

export async function loadBillVerification(
	client: Executor,
): Promise<BillVerification> {
	const [bills, accounts, approved] = await Promise.all([
		loadBills({ client }),
		loadAccounts({ client }),
		loadApprovedBills(client),
	]);
	const receipts = accounts.flatMap((account) => account.receipts);
	const verified = bills.flatMap((bill) => {
		const shares = bill.shares
			.filter((share) => !share.isOwner)
			.map((share) => toShare(share, receipts));
		return shares.length
			? [toVerifiedBill(bill, shares, approved.has(bill.id))]
			: [];
	});
	return { bills: verified, summary: summarise(verified) };
}

function toVerifiedBill(
	bill: Bill,
	shares: BillShare[],
	approved: boolean,
): VerifiedBill {
	const check = shares.some(
		(share) => share.paidCents > share.amountCents || share.paidCents < 0,
	);
	return {
		id: bill.id,
		name: bill.name,
		category: bill.shares[0]?.category ?? "bill",
		dueAt: bill.dueAt,
		amountCents: sum(shares, (share) => share.amountCents),
		paidCents: bill.paidCents,
		remainingCents: bill.remainingCents,
		status: check ? "check" : statusOf[bill.status],
		approved,
		needsLook: !approved,
		shares,
	};
}

function toShare(
	share: Bill["shares"][number],
	receipts: Receipt[],
): BillShare {
	return {
		debtId: share.id,
		housemateId: share.housemateId,
		housemateName: share.housemateName,
		amountCents: share.amountCents,
		paidCents: share.paidCents,
		remainingCents: share.remainingCents,
		receipts: share.payments.flatMap((payment) => {
			const receipt = receipts.find((item) => item.id === payment.receiptId);
			if (!receipt) return [];
			return [
				{
					receiptId: receipt.id,
					amountCents: payment.amountCents,
					description: receipt.description,
					receivedAt: receipt.receivedAt,
					kind: receipt.kind,
				},
			];
		}),
	};
}

function summarise(bills: VerifiedBill[]): BillVerificationSummary {
	const count = (status: BillVerificationStatus): number =>
		bills.filter((bill) => bill.status === status).length;
	return {
		paid: count("paid"),
		part: count("part"),
		unpaid: count("unpaid"),
		check: count("check"),
		approved: bills.filter((bill) => bill.approved).length,
		needsLook: bills.filter((bill) => bill.needsLook).length,
		remainingCents: sum(bills, (bill) => bill.remainingCents),
	};
}

// An admin's tick that a bill's payments look right. It is a statement about
// the bill as reviewed, not a lock: allocations can still change afterwards.
export async function approveBill(
	client: Executor,
	billId: string,
	approved: boolean,
): Promise<void> {
	if (approved)
		await client.execute({
			sql: "INSERT INTO bill_reviews(bill_id,reviewed_at) VALUES (?,unixepoch()) ON CONFLICT(bill_id) DO NOTHING",
			args: [billId],
		});
	else
		await client.execute({
			sql: "DELETE FROM bill_reviews WHERE bill_id=?",
			args: [billId],
		});
}

async function loadApprovedBills(client: Executor): Promise<Set<string>> {
	const result = await client.execute("SELECT bill_id FROM bill_reviews");
	return new Set(result.rows.map((row) => String(row.bill_id)));
}
