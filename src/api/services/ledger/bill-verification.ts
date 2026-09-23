import type { Client } from "@libsql/client";
import {
	type BillPaymentView,
	type ReceiptView,
	getAccountPayments,
} from "./account-payments";

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
	shares: BillShare[];
}
export interface BillVerificationSummary {
	paid: number;
	part: number;
	unpaid: number;
	check: number;
	remainingCents: number;
}
export type BillVerification =
	| { available: false }
	| {
			available: true;
			bills: VerifiedBill[];
			summary: BillVerificationSummary;
	  };

interface DebtRow {
	billId: string;
	billName: string | null;
}
interface Housemate {
	id: string;
	name: string;
}

export async function loadBillVerification(
	client: Executor,
): Promise<BillVerification> {
	const installed = await client.execute(
		"SELECT name FROM sqlite_master WHERE type='table' AND name='ledger_entries'",
	);
	if (installed.rows.length === 0) return { available: false };
	const [housemateRows, debtRows] = await Promise.all([
		client.execute(
			"SELECT id,name FROM housemates WHERE is_owner=0 ORDER BY name",
		),
		client.execute(
			"SELECT d.id,d.bill_id,b.biller_name FROM debts d LEFT JOIN bills b ON b.id=d.bill_id",
		),
	]);
	const housemates: Housemate[] = housemateRows.rows.map((row) => ({
		id: String(row.id),
		name: String(row.name),
	}));
	const debts = new Map<string, DebtRow>(
		debtRows.rows.map((row) => [
			String(row.id),
			{
				billId: String(row.bill_id),
				billName: row.biller_name === null ? null : String(row.biller_name),
			},
		]),
	);
	const accounts = await Promise.all(
		housemates.map(async (housemate) => ({
			housemate,
			account: await getAccountPayments(client, housemate.id),
		})),
	);
	const bills = pivot(accounts, debts);
	return { available: true, bills, summary: summarise(bills) };
}

function pivot(
	accounts: Array<{
		housemate: Housemate;
		account: Awaited<ReturnType<typeof getAccountPayments>>;
	}>,
	debts: Map<string, DebtRow>,
): VerifiedBill[] {
	const groups = new Map<string, VerifiedBill>();
	for (const { housemate, account } of accounts) {
		for (const view of account.bills) {
			const debt = debts.get(view.id);
			if (!debt) continue;
			const share = toShare(view, housemate, account.receipts);
			const existing = groups.get(debt.billId);
			groups.set(debt.billId, {
				id: debt.billId,
				name: existing?.name ?? debt.billName ?? view.name,
				category: existing?.category ?? view.category,
				dueAt: existing?.dueAt ?? view.dueAt,
				amountCents: 0,
				paidCents: 0,
				remainingCents: 0,
				status: "unpaid",
				shares: [...(existing?.shares ?? []), share],
			});
		}
	}
	return [...groups.values()]
		.map(finalise)
		.sort(
			(a, b) => (b.dueAt ?? 0) - (a.dueAt ?? 0) || a.id.localeCompare(b.id),
		);
}

function toShare(
	view: BillPaymentView,
	housemate: Housemate,
	receipts: ReceiptView[],
): BillShare {
	return {
		debtId: view.id,
		housemateId: housemate.id,
		housemateName: housemate.name,
		amountCents: view.amountCents,
		paidCents: view.paidCents,
		remainingCents: view.remainingCents,
		receipts: view.payments.flatMap((payment) => {
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

function finalise(bill: VerifiedBill): VerifiedBill {
	const shares = [...bill.shares].sort((a, b) =>
		a.housemateName.localeCompare(b.housemateName),
	);
	const sum = (pick: (share: BillShare) => number): number =>
		shares.reduce((total, share) => total + pick(share), 0);
	return {
		...bill,
		shares,
		amountCents: sum((share) => share.amountCents),
		paidCents: sum((share) => share.paidCents),
		remainingCents: sum((share) => share.remainingCents),
		status: statusOf(shares),
	};
}

function statusOf(shares: BillShare[]): BillVerificationStatus {
	if (
		shares.some(
			(share) => share.paidCents > share.amountCents || share.paidCents < 0,
		)
	)
		return "check";
	if (shares.every((share) => share.remainingCents === 0)) return "paid";
	if (shares.every((share) => share.paidCents === 0)) return "unpaid";
	return "part";
}

function summarise(bills: VerifiedBill[]): BillVerificationSummary {
	const count = (status: BillVerificationStatus): number =>
		bills.filter((bill) => bill.status === status).length;
	return {
		paid: count("paid"),
		part: count("part"),
		unpaid: count("unpaid"),
		check: count("check"),
		remainingCents: bills.reduce((sum, bill) => sum + bill.remainingCents, 0),
	};
}
