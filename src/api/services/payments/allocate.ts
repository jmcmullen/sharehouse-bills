import type { Client } from "@libsql/client";
import { z } from "zod";
import { generateEntityId } from "../../../lib/id";
import { loadBill } from "../account/account.server";
import { type AccountPayments, getAccountPayments } from "./account-payments";
import {
	enqueuePaymentReceipt,
	paymentReceiptKind,
} from "./receipt-notifications";
import { type Executor, nowSeconds, withWriteTransaction } from "./transaction";

export const billAllocationsSchema = z
	.array(
		z.object({
			debtId: z.string().min(1),
			amountCents: z.number().int().safe().positive(),
		}),
	)
	.max(100);
type BillAllocations = z.infer<typeof billAllocationsSchema>;

export const allocateReceiptSchema = z.object({
	housemateId: z.string().min(1),
	receiptId: z.string().min(1),
	allocations: billAllocationsSchema,
	expectedRevision: z.string(),
});

interface NewReceipt {
	housemateId: string;
	amountCents: number;
	receivedAt: number;
	kind: "bank" | "cash";
	bankTransactionId: string | null;
	note: string;
}

export async function insertReceipt(
	tx: Executor,
	receipt: NewReceipt,
): Promise<string> {
	const id = generateEntityId();
	await tx.execute({
		sql: "INSERT INTO receipts(id,housemate_id,amount_cents,received_at,kind,bank_transaction_id,note,recorded_at) VALUES (?,?,?,?,?,?,?,?)",
		args: [
			id,
			receipt.housemateId,
			receipt.amountCents,
			receipt.receivedAt,
			receipt.kind,
			receipt.bankTransactionId,
			receipt.note,
			nowSeconds(),
		],
	});
	return id;
}

// Voids every live receipt for a bank transaction, releasing what each paid.
// A housemate who was already sent (or is about to be sent) a receipt is told
// the money no longer counts.
export async function voidReceipts(
	tx: Executor,
	bankTransactionId: string,
	reason: string,
): Promise<void> {
	const live = (
		await tx.execute({
			sql: "SELECT id,housemate_id FROM receipts WHERE bank_transaction_id=? AND voided_at IS NULL",
			args: [bankTransactionId],
		})
	).rows;
	for (const row of live) {
		const receiptId = String(row.id);
		await releaseAllocations(tx, "receipt_id", receiptId);
		if ((await paymentReceiptKind(tx, receiptId)) === "correction")
			await enqueuePaymentReceipt(
				tx,
				String(row.housemate_id),
				receiptId,
				"void",
			);
		await tx.execute({
			sql: "UPDATE receipts SET voided_at=?,void_reason=? WHERE id=?",
			args: [nowSeconds(), reason, row.id],
		});
	}
}

// Moves allocated money back to credit, recording each release in history. A
// bill this makes unpaid withdraws its group message if it has not gone out,
// so the payment that settles it again announces it.
export async function releaseAllocations(
	tx: Executor,
	column: "receipt_id" | "debt_id",
	id: string,
): Promise<void> {
	const billIds = (
		await tx.execute({
			sql: `SELECT DISTINCT d.bill_id FROM allocations a JOIN debts d ON d.id=a.debt_id WHERE a.${column}=?`,
			args: [id],
		})
	).rows.map((row) => String(row.bill_id));
	const paid = await paidBills(tx, billIds);
	await tx.execute({
		sql: `INSERT INTO allocation_history(receipt_id,debt_id,amount_cents,recorded_at) SELECT receipt_id,debt_id,-amount_cents,? FROM allocations WHERE ${column}=?`,
		args: [nowSeconds(), id],
	});
	await tx.execute({
		sql: `DELETE FROM allocations WHERE ${column}=?`,
		args: [id],
	});
	const stillPaid = await paidBills(tx, paid);
	for (const billId of paid.filter((item) => !stillPaid.includes(item)))
		await tx.execute({
			sql: "DELETE FROM whatsapp_notifications WHERE event_key=? AND status='pending'",
			args: [`bill-paid:${billId}`],
		});
}

// Checked one at a time: statements inside a transaction run in order.
async function paidBills(tx: Executor, billIds: string[]): Promise<string[]> {
	const paid: string[] = [];
	for (const billId of billIds)
		if (await isBillPaid(tx, billId)) paid.push(billId);
	return paid;
}

// Replaces the receipt's allocations with the admin's decision. An empty list
// keeps the whole receipt as credit.
export async function writeAllocations(
	tx: Executor,
	account: AccountPayments,
	receiptId: string,
	allocations: BillAllocations,
): Promise<void> {
	validateAllocations(account, receiptId, allocations);
	await releaseAllocations(tx, "receipt_id", receiptId);
	for (const allocation of allocations)
		await writeAllocation(
			tx,
			receiptId,
			allocation.debtId,
			allocation.amountCents,
		);
}

// Reallocation from the Accounts page. The housemate hears about the first
// allocation as a receipt and about later changes as corrections.
export async function allocateReceipt(
	client: Client,
	input: z.input<typeof allocateReceiptSchema>,
): Promise<void> {
	const data = allocateReceiptSchema.parse(input);
	await withWriteTransaction(client, async (tx) => {
		const account = await getAccountPayments(tx, data.housemateId);
		if (account.revision !== data.expectedRevision)
			throw new Error("Payments or bills changed. Refresh before saving.");
		await writeAllocations(tx, account, data.receiptId, data.allocations);
		await enqueuePaymentReceipt(
			tx,
			data.housemateId,
			data.receiptId,
			await paymentReceiptKind(tx, data.receiptId),
		);
	});
}

function validateAllocations(
	account: AccountPayments,
	receiptId: string,
	allocations: BillAllocations,
): void {
	const receipt = account.receipts.find((item) => item.id === receiptId);
	if (!receipt || receipt.amountCents <= 0)
		throw new Error("Select a received payment");
	if (
		new Set(allocations.map((item) => item.debtId)).size !== allocations.length
	)
		throw new Error("Each bill can appear only once");
	if (
		allocations.reduce((sum, item) => sum + item.amountCents, 0) >
		receipt.amountCents
	)
		throw new Error("Bill allocations exceed the payment received");
	for (const allocation of allocations) {
		const bill = account.bills.find((item) => item.id === allocation.debtId);
		if (!bill) throw new Error("Select a bill for this housemate");
		const previous =
			receipt.allocations.find((item) => item.debtId === bill.id)
				?.amountCents ?? 0;
		if (bill.paidCents - previous + allocation.amountCents > bill.amountCents)
			throw new Error("An allocation exceeds the bill's remaining share");
		if (receipt.rentOnly && !/rent/i.test(bill.category))
			throw new Error("Allocate a rent payment to rent bills");
	}
}

async function writeAllocation(
	tx: Executor,
	receiptId: string,
	debtId: string,
	amountCents: number,
): Promise<void> {
	const billId = await shareBillId(tx, debtId);
	const wasPaid = await isBillPaid(tx, billId);
	await tx.execute({
		sql: "INSERT INTO allocations(receipt_id,debt_id,amount_cents) VALUES (?,?,?)",
		args: [receiptId, debtId, amountCents],
	});
	await tx.execute({
		sql: "INSERT INTO allocation_history(receipt_id,debt_id,amount_cents,recorded_at) VALUES (?,?,?,?)",
		args: [receiptId, debtId, amountCents, nowSeconds()],
	});
	if (!wasPaid && (await isBillPaid(tx, billId)))
		await queueBillPaid(tx, billId);
}

async function shareBillId(tx: Executor, debtId: string): Promise<string> {
	const row = (
		await tx.execute({
			sql: "SELECT bill_id FROM debts WHERE id=?",
			args: [debtId],
		})
	).rows[0];
	if (!row) throw new Error("Bill share not found");
	return String(row.bill_id);
}

async function isBillPaid(tx: Executor, billId: string): Promise<boolean> {
	return (await loadBill(billId, { client: tx }))?.status === "paid";
}

// The group chat hears once when the allocation that pays a bill's last share
// commits. Housemates hear about their own payments through the receipt.
async function queueBillPaid(tx: Executor, billId: string): Promise<void> {
	const now = nowSeconds();
	await tx.execute({
		sql: "INSERT INTO whatsapp_notifications(id,event_key,event_type,status,bill_id,payload,created_at,updated_at) VALUES (?,?,'bill_paid','pending',?,?,?,?) ON CONFLICT(event_key) DO NOTHING",
		args: [
			generateEntityId(),
			`bill-paid:${billId}`,
			billId,
			JSON.stringify({ source: "ledger" }),
			now,
			now,
		],
	});
}
