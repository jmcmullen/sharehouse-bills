import type { Client } from "@libsql/client";
import { z } from "zod";
import { generateEntityId } from "../../../lib/id";
import { bankTransactionSchema, namedBeneficiaries } from "./model";
import { loadHousemates, nowSeconds } from "./sources";

type Executor = Pick<Client, "execute">;

export const paymentArrivedPayloadSchema = z.object({
	source: z.literal("ledger"),
	transactionId: z.string().min(1),
	housemateId: z.string().nullable(),
	sharedWith: z.array(z.string()),
});
type PaymentArrivedPayload = z.infer<typeof paymentArrivedPayloadSchema>;

const paymentArrivedEventKey = (transactionId: string): string =>
	`payment-arrived:${transactionId}`;

// Tells the owner that money needing a decision has arrived. One row per bank
// transaction, written inside the ingest transaction; the event key keeps
// re-ingests and settlement updates silent. Returns true when a row was added.
export async function enqueuePaymentArrived(
	tx: Executor,
	transactionId: string,
): Promise<boolean> {
	const row = (
		await tx.execute({
			sql: "SELECT decision,housemate_id,amount_cents,raw_data FROM ledger_bank_transactions WHERE id=?",
			args: [transactionId],
		})
	).rows[0];
	if (!row || row.decision !== "review" || Number(row.amount_cents) <= 0)
		return false;
	const housemates = await loadHousemates(tx);
	const owner = housemates.find((housemate) => housemate.isOwner);
	if (!owner) return false;
	const housemateId =
		row.housemate_id === null ? null : String(row.housemate_id);
	const sharedWith = housemateId
		? []
		: namedBeneficiaries(
				bankTransactionSchema.parse(JSON.parse(String(row.raw_data))),
				housemates,
			).map((housemate) => housemate.id);
	if (!housemateId && sharedWith.length < 2) return false;
	const payload: PaymentArrivedPayload = {
		source: "ledger",
		transactionId,
		housemateId,
		sharedWith,
	};
	const now = nowSeconds();
	const result = await tx.execute({
		sql: "INSERT INTO whatsapp_notifications(id,event_key,event_type,status,housemate_id,payload,created_at,updated_at) VALUES (?,?,'payment_arrived','pending',?,?,?,?) ON CONFLICT(event_key) DO NOTHING",
		args: [
			generateEntityId(),
			paymentArrivedEventKey(transactionId),
			owner.id,
			JSON.stringify(payload),
			now,
			now,
		],
	});
	return result.rowsAffected > 0;
}
