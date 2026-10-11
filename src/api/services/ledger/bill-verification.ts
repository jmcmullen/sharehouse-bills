import type { Client } from "@libsql/client";
import type { Bill, Receipt } from "../account/account";
import { loadAccounts, loadBills } from "../account/account.server";
import { type BillStatus, sum } from "../account/compute";
import { loadApprovedBills } from "./bill-reviews";

type Executor = Pick<Client, "execute">;

export interface ShareReceipt {
	receiptId: string;
	amountCents: number;
	description: string;
	receivedAt: number;
	receivedDateKnown: boolean;
	bankMatched: boolean;
	manual: boolean;
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
export type BillVerification =
	| { available: false }
	| {
			available: true;
			bills: VerifiedBill[];
			summary: BillVerificationSummary;
	  };

const statusOf: Record<BillStatus, BillVerificationStatus> = {
	pending: "unpaid",
	partially_paid: "part",
	paid: "paid",
};

export async function loadBillVerification(
	client: Executor,
): Promise<BillVerification> {
	const installed = await client.execute(
		"SELECT name FROM sqlite_master WHERE type='table' AND name='ledger_entries'",
	);
	if (installed.rows.length === 0) return { available: false };
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
	return { available: true, bills: verified, summary: summarise(verified) };
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
					receivedDateKnown: receipt.receivedDateKnown,
					bankMatched: receipt.bankMatched,
					manual: receipt.manual,
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
