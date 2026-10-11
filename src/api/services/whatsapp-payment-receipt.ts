import type { Client } from "@libsql/client";
import { loadAccount } from "./account/account.server";
import { creditCents } from "./account/compute";
import { withLedgerClient } from "./payments/client.server";
import {
	type PaymentReceiptPayload,
	paymentReceiptPayloadSchema,
} from "./payments/receipt-notifications";

type Executor = Pick<Client, "execute">;
interface ReceiptLine {
	billName: string;
	dueDate: Date | null;
	amountCents: number;
}
interface PaymentReceiptContext {
	kind: "receipt" | "correction";
	// How the money arrived, so cash is not described as a transfer.
	method: "bank" | "cash";
	housemate: {
		id: string;
		name: string;
		firstName: string;
		whatsappNumber: string | null;
	};
	amountCents: number;
	receivedAt: Date;
	before: ReceiptLine[];
	after: ReceiptLine[];
	voided: boolean;
	creditCents: number;
	balanceCents: number;
}

// Rebuilds the receipt message inputs from the decision snapshot the ledger
// stored, plus the housemate's live balance. Money voided since the message was
// queued is not described, except by the correction that says it was voided.
export async function getPaymentReceiptNotificationContext(
	notificationId: string,
	options: { client?: Executor } = {},
): Promise<PaymentReceiptContext | null> {
	return options.client
		? loadContext(options.client, notificationId)
		: withLedgerClient((client) => loadContext(client, notificationId));
}

async function loadContext(
	client: Executor,
	notificationId: string,
): Promise<PaymentReceiptContext | null> {
	const row = (
		await client.execute({
			sql: "SELECT n.event_type,n.payload,h.id AS housemate_id,h.name,h.whatsapp_number FROM whatsapp_notifications n JOIN housemates h ON h.id=n.housemate_id WHERE n.id=?",
			args: [notificationId],
		})
	).rows[0];
	if (!row) return null;
	const parsed = paymentReceiptPayloadSchema.safeParse(
		JSON.parse(String(row.payload)),
	);
	if (!parsed.success) return null;
	const payload = parsed.data;
	const receipt = await loadReceipt(client, payload.receiptId);
	if (!payload.voided && receipt?.voided) return null;
	const housemateId = String(row.housemate_id);
	const name = String(row.name);
	const [before, after, account] = await Promise.all([
		billLines(client, payload.before),
		billLines(client, payload.after),
		loadAccount(housemateId, { client }),
	]);
	return {
		kind:
			String(row.event_type) === "payment_correction"
				? "correction"
				: "receipt",
		method: receipt?.method ?? "bank",
		housemate: {
			id: housemateId,
			name,
			firstName: name.trim().split(/\s+/)[0] ?? name,
			whatsappNumber:
				row.whatsapp_number === null ? null : String(row.whatsapp_number),
		},
		amountCents: payload.amountCents,
		receivedAt: new Date(payload.receivedAt * 1000),
		before,
		after,
		voided: payload.voided,
		// What this payment left as credit, as the admin confirmed it.
		creditCents: payload.voided
			? 0
			: creditCents([
					{ amountCents: payload.amountCents, allocations: payload.after },
				]),
		balanceCents: account?.balanceCents ?? 0,
	};
}

async function loadReceipt(
	client: Executor,
	receiptId: string,
): Promise<{ method: "bank" | "cash"; voided: boolean } | null> {
	const row = (
		await client.execute({
			sql: "SELECT kind,voided_at FROM receipts WHERE id=?",
			args: [receiptId],
		})
	).rows[0];
	if (!row) return null;
	return {
		method: row.kind === "cash" ? "cash" : "bank",
		voided: row.voided_at !== null,
	};
}

async function billLines(
	client: Executor,
	allocations: PaymentReceiptPayload["after"],
): Promise<ReceiptLine[]> {
	if (!allocations.length) return [];
	const rows = (
		await client.execute({
			sql: `SELECT d.id,b.biller_name,b.due_date FROM debts d JOIN bills b ON b.id=d.bill_id WHERE d.id IN (${allocations.map(() => "?").join(",")})`,
			args: allocations.map((item) => item.debtId),
		})
	).rows;
	return allocations.map((allocation) => {
		const row = rows.find((item) => String(item.id) === allocation.debtId);
		return {
			billName: row ? String(row.biller_name) : "Bill",
			dueDate:
				row?.due_date === null || row?.due_date === undefined
					? null
					: new Date(Number(row.due_date) * 1000),
			amountCents: allocation.amountCents,
		};
	});
}
