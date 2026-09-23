import type { Client, Transaction } from "@libsql/client";
import { z } from "zod";
import { type AccountPayments, getAccountPayments } from "./account-payments";
import {
	clearAllocationIssue,
	releaseBillAllocations,
	writeBillAllocation,
} from "./bill-allocations";
import { sourceSchema } from "./model";
import {
	enqueuePaymentReceipt,
	paymentReceiptKind,
} from "./receipt-notifications";
import { applySource, withWriteTransaction } from "./sources";

const allocationsSchema = z
	.array(
		z.object({
			debtId: z.string().min(1),
			amountCents: z.number().int().safe().positive(),
		}),
	)
	.max(100);
export const allocateReceiptSchema = z.object({
	housemateId: z.string().min(1),
	receiptId: z.string().min(1),
	allocations: allocationsSchema,
	expectedRevision: z.string(),
});
export const recordReceiptSchema = z.object({
	confirmedSeparate: z.boolean().default(false),
	housemateId: z.string().min(1),
	amountCents: z.number().int().safe().positive(),
	receivedAt: z.number().int().positive(),
	description: z.string().trim().min(1).max(200),
	expectedRevision: z.string(),
});

export async function allocateReceipt(
	client: Client,
	input: z.infer<typeof allocateReceiptSchema>,
): Promise<void> {
	const data = allocateReceiptSchema.parse(input);
	await withWriteTransaction(client, async (tx) => {
		const account = await getAccountPayments(tx, data.housemateId);
		if (account.revision !== data.expectedRevision)
			throw new Error("Payments or bills changed. Refresh before saving.");
		await writeAllocations(tx, account, data);
		await enqueuePaymentReceipt(
			tx,
			data.housemateId,
			data.receiptId,
			await paymentReceiptKind(tx, data.receiptId),
		);
	});
}

async function writeAllocations(
	tx: Transaction,
	account: AccountPayments,
	data: z.infer<typeof allocateReceiptSchema>,
): Promise<void> {
	const receipt = validateAllocations(account, data);
	const sources = (
		await tx.execute({
			sql: `SELECT source_key,snapshot FROM ledger_sources WHERE source_key IN (${receipt.sourceKeys.map(() => "?").join(",")}) ORDER BY source_key`,
			args: receipt.sourceKeys,
		})
	).rows.map((row) => ({
		key: String(row.source_key),
		remaining: -sourceSchema.parse(JSON.parse(String(row.snapshot)))
			.amountCents,
	}));
	for (const source of sources) {
		await releaseBillAllocations(tx, source.key, "source");
		await clearAllocationIssue(tx, source.key);
		await tx.execute({
			sql: "INSERT INTO ledger_allocation_reviews(source_key,reviewed_at) VALUES (?,unixepoch()) ON CONFLICT(source_key) DO UPDATE SET reviewed_at=excluded.reviewed_at",
			args: [source.key],
		});
	}
	for (const write of planAllocationWrites(sources, data.allocations))
		await writeBillAllocation(
			tx,
			write.key,
			write.debtId,
			write.amount,
			"review",
		);
}

interface SourceBalance {
	key: string;
	remaining: number;
}
interface AllocationWrite {
	key: string;
	debtId: string;
	amount: number;
}

function planAllocationWrites(
	sources: SourceBalance[],
	allocations: z.infer<typeof allocationsSchema>,
): AllocationWrite[] {
	const debts = spans(allocations.map((item) => item.amountCents));
	const funds = spans(sources.map((item) => Math.max(0, item.remaining)));
	return allocations.flatMap((allocation, i) =>
		sources.flatMap((source, j) => {
			const amount =
				Math.min(debts[i].end, funds[j].end) -
				Math.max(debts[i].start, funds[j].start);
			return amount > 0
				? [{ key: source.key, debtId: allocation.debtId, amount }]
				: [];
		}),
	);
}

// Allocations fill sources in order, so each write is the overlap of the two cumulative ranges.
function spans(amounts: number[]): Array<{ start: number; end: number }> {
	return amounts.map((amount, index) => {
		const start = amounts.slice(0, index).reduce((sum, item) => sum + item, 0);
		return { start, end: start + amount };
	});
}

function validateAllocations(
	account: AccountPayments,
	data: z.infer<typeof allocateReceiptSchema>,
) {
	const receipt = account.receipts.find((item) => item.id === data.receiptId);
	if (!receipt || receipt.amountCents <= 0)
		throw new Error("Select a received payment");
	if (
		new Set(data.allocations.map((item) => item.debtId)).size !==
		data.allocations.length
	)
		throw new Error("Each bill can appear only once");
	if (
		data.allocations.reduce((sum, item) => sum + item.amountCents, 0) >
		receipt.amountCents
	)
		throw new Error("Bill allocations exceed the payment received");
	for (const allocation of data.allocations) {
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
	return receipt;
}

export async function recordReceipt(
	client: Client,
	input: z.input<typeof recordReceiptSchema>,
): Promise<void> {
	const data = recordReceiptSchema.parse(input);
	if (data.receivedAt > Math.floor(Date.now() / 1000))
		throw new Error("Money received cannot have a future date");
	await withWriteTransaction(client, async (tx) => {
		if (
			!(
				await tx.execute({
					sql: "SELECT 1 FROM housemates WHERE id=? AND is_owner=0",
					args: [data.housemateId],
				})
			).rows.length
		)
			throw new Error("Housemate not found");
		const account = await getAccountPayments(tx, data.housemateId);
		if (account.revision !== data.expectedRevision)
			throw new Error("Payments or bills changed. Refresh before saving.");
		if (
			!data.confirmedSeparate &&
			account.receipts.some(
				(receipt) =>
					receipt.amountCents === data.amountCents &&
					Math.abs(receipt.receivedAt - data.receivedAt) <= 7 * 86400,
			)
		)
			throw new Error(
				"This amount may already be recorded. Allocate the existing receipt, or confirm this is additional money.",
			);
		await applySource(tx, `manual:ledger-${crypto.randomUUID()}`, {
			housemateId: data.housemateId,
			kind: "payment",
			amountCents: -data.amountCents,
			description: data.description,
			billId: null,
			effectiveAt: data.receivedAt,
			dueAt: null,
		});
		await tx.execute({
			sql: "INSERT INTO ledger_events(kind,source_id,payload) SELECT 'bank',id,raw_data FROM ledger_bank_transactions WHERE housemate_id=? AND decision_origin!='review' AND bank_status!='DELETED'",
			args: [data.housemateId],
		});
	});
}
