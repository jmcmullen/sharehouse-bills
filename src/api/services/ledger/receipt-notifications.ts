import type { Client } from "@libsql/client";
import { z } from "zod";
import { generateEntityId } from "../../../lib/id";
import { getAccountPayments } from "./account-payments";

type Executor = Pick<Client, "execute">;
type PaymentReceiptKind = "receipt" | "correction";

const allocationSchema = z.object({
	debtId: z.string().min(1),
	amountCents: z.number().int(),
});
export const paymentReceiptPayloadSchema = z.object({
	source: z.literal("ledger"),
	receiptId: z.string().min(1),
	sequence: z.number().int().min(0),
	amountCents: z.number().int(),
	receivedAt: z.number().int(),
	before: z.array(allocationSchema),
	after: z.array(allocationSchema),
});
export type PaymentReceiptPayload = z.infer<typeof paymentReceiptPayloadSchema>;

function paymentReceiptEventKey(
	kind: PaymentReceiptKind,
	receiptId: string,
	sequence: number,
): string {
	return kind === "receipt"
		? `payment-receipt:${receiptId}`
		: `payment-correction:${receiptId}:${sequence}`;
}

// A receipt is sent once; every later change to the same money is a correction.
export async function paymentReceiptKind(
	tx: Executor,
	receiptId: string,
): Promise<PaymentReceiptKind> {
	const rows = (
		await tx.execute({
			sql: "SELECT 1 FROM whatsapp_notifications WHERE event_key=?",
			args: [paymentReceiptEventKey("receipt", receiptId, 0)],
		})
	).rows;
	return rows.length ? "correction" : "receipt";
}

// Records the housemate's WhatsApp receipt inside the ledger transaction that
// confirmed the allocations. The payload snapshots the decision so the message
// describes what the admin confirmed even if allocations change again before
// dispatch. Returns false when a correction would repeat the last message.
export async function enqueuePaymentReceipt(
	tx: Executor,
	housemateId: string,
	receiptId: string,
	kind: PaymentReceiptKind,
): Promise<boolean> {
	const account = await getAccountPayments(tx, housemateId);
	const receipt = account.receipts.find((item) => item.id === receiptId);
	if (!receipt) throw new Error("Payment receipt not found");
	const latest = await latestPayload(tx, receiptId);
	const before = kind === "receipt" ? [] : (latest?.after ?? []);
	if (kind === "correction" && sameAllocations(before, receipt.allocations))
		return false;
	const sequence = kind === "receipt" ? 0 : (latest?.sequence ?? 0) + 1;
	const payload: PaymentReceiptPayload = {
		source: "ledger",
		receiptId,
		sequence,
		amountCents: receipt.amountCents,
		receivedAt: receipt.receivedAt,
		before,
		after: receipt.allocations,
	};
	const now = Math.floor(Date.now() / 1000);
	await tx.execute({
		sql: "INSERT INTO whatsapp_notifications(id,event_key,event_type,status,housemate_id,payload,created_at,updated_at) VALUES (?,?,?,'pending',?,?,?,?) ON CONFLICT(event_key) DO NOTHING",
		args: [
			generateEntityId(),
			paymentReceiptEventKey(kind, receiptId, sequence),
			kind === "receipt" ? "payment_receipt" : "payment_correction",
			housemateId,
			JSON.stringify(payload),
			now,
			now,
		],
	});
	return true;
}

async function latestPayload(
	tx: Executor,
	receiptId: string,
): Promise<PaymentReceiptPayload | null> {
	const payloads = (
		await tx.execute({
			sql: "SELECT payload FROM whatsapp_notifications WHERE event_type IN ('payment_receipt','payment_correction') AND json_extract(payload,'$.receiptId')=?",
			args: [receiptId],
		})
	).rows.map((row) =>
		paymentReceiptPayloadSchema.parse(JSON.parse(String(row.payload))),
	);
	return payloads.length
		? payloads.reduce((best, item) =>
				item.sequence > best.sequence ? item : best,
			)
		: null;
}

function sameAllocations(
	left: PaymentReceiptPayload["after"],
	right: PaymentReceiptPayload["after"],
): boolean {
	const key = (items: PaymentReceiptPayload["after"]) =>
		JSON.stringify([...items].sort((a, b) => a.debtId.localeCompare(b.debtId)));
	return key(left) === key(right);
}
