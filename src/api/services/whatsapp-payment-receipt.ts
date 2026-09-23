import type { Client } from "@libsql/client";
import { createLedgerClient } from "./ledger/client.server";
import { currentStatement } from "./ledger/model";
import {
	type PaymentReceiptPayload,
	paymentReceiptPayloadSchema,
} from "./ledger/receipt-notifications";
import { getAccountStatement, nowSeconds } from "./ledger/sources";

type Executor = Pick<Client, "execute">;
interface ReceiptLine {
	billName: string;
	dueDate: Date | null;
	amountCents: number;
}
interface PaymentReceiptContext {
	kind: "receipt" | "correction";
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
	creditCents: number;
	balanceCents: number;
}

async function withLedger<T>(run: (client: Client) => Promise<T>): Promise<T> {
	const client = createLedgerClient();
	try {
		return await run(client);
	} finally {
		client.close();
	}
}

// Rebuilds the receipt message inputs from the decision snapshot the ledger
// stored, plus the housemate's live balance.
export async function getPaymentReceiptNotificationContext(
	notificationId: string,
): Promise<PaymentReceiptContext | null> {
	return withLedger(async (client) => {
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
		const housemateId = String(row.housemate_id);
		const name = String(row.name);
		const [before, after, statement] = await Promise.all([
			billLines(client, payload.before),
			billLines(client, payload.after),
			getAccountStatement(client, housemateId),
		]);
		return {
			kind:
				String(row.event_type) === "payment_correction"
					? "correction"
					: "receipt",
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
			creditCents:
				payload.amountCents -
				payload.after.reduce((sum, item) => sum + item.amountCents, 0),
			balanceCents: currentStatement(statement, nowSeconds()).balanceCents,
		};
	});
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
