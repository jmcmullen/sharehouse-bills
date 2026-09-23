import type { Client } from "@libsql/client";
import { z } from "zod";
import { ingestBankTransaction } from "./bank-ingest";
import { toCents } from "./model";
import { syncPaidState } from "./paid-state";
import {
	type Executor,
	applySource,
	nowSeconds,
	withWriteTransaction,
} from "./sources";

const chargeEventSchema = z.object({
	id: z.string(),
	housemateId: z.string(),
	billId: z.string(),
	amount: z.number(),
	effectiveAt: z.number(),
	dueAt: z.number().nullable(),
	description: z.string(),
});
const paymentEventSchema = z.object({
	id: z.string(),
	transactionId: z.string(),
	housemateId: z.string().nullable(),
	amount: z.number(),
	status: z.string(),
	source: z.string(),
	description: z.string(),
	rawData: z.string().nullable(),
	effectiveAt: z.number(),
	createdAt: z.number(),
	debtIds: z.string().nullable(),
	deleted: z.number(),
});

async function processEvent(
	tx: Executor,
	kind: string,
	payload: string,
): Promise<void> {
	if (kind === "paid_state") {
		await syncAllPaidState(tx);
		return;
	}
	if (kind === "bank") {
		await ingestBankTransaction(tx, JSON.parse(payload));
		return;
	}
	if (kind === "charge") {
		await processChargeEvent(tx, chargeEventSchema.parse(JSON.parse(payload)));
		return;
	}
	if (kind === "payment") {
		await processPaymentEvent(
			tx,
			paymentEventSchema.parse(JSON.parse(payload)),
		);
		return;
	}
	throw new Error(`Unknown ledger event kind: ${kind}`);
}

// Rewrites legacy paid state for every debt an allocation has ever touched.
async function syncAllPaidState(tx: Executor): Promise<void> {
	const debtIds = (
		await tx.execute("SELECT DISTINCT debt_id FROM ledger_allocation_history")
	).rows.map((row) => String(row.debt_id));
	await syncPaidState(tx, debtIds);
}

async function processChargeEvent(
	tx: Executor,
	event: z.infer<typeof chargeEventSchema>,
): Promise<void> {
	await applySource(
		tx,
		`charge:${event.id}`,
		event.amount === 0
			? null
			: {
					housemateId: event.housemateId,
					amountCents: toCents(event.amount),
					kind: "charge",
					description: event.description,
					billId: event.billId,
					effectiveAt: event.effectiveAt,
					dueAt: event.dueAt,
				},
	);
}

async function processPaymentEvent(
	tx: Executor,
	event: z.infer<typeof paymentEventSchema>,
): Promise<void> {
	if (event.source === "manual_admin") {
		await applySource(
			tx,
			`manual:${event.transactionId}`,
			event.deleted || event.status !== "matched" || !event.housemateId
				? null
				: {
						housemateId: event.housemateId,
						amountCents: -toCents(event.amount),
						kind: event.amount >= 0 ? "payment" : "adjustment",
						description: event.description,
						billId: null,
						effectiveAt: event.effectiveAt,
						dueAt: null,
					},
		);
		await tx.execute({
			sql: "INSERT INTO ledger_events(kind,source_id,payload) SELECT 'bank',id,raw_data FROM ledger_bank_transactions WHERE (decision_origin='automatic' AND housemate_id=?) OR id IN (SELECT transaction_id FROM ledger_payment_evidence WHERE source_key=?)",
			args: [event.housemateId, `manual:${event.transactionId}`],
		});
		return;
	}
	if (event.rawData) {
		await ingestBankTransaction(tx, JSON.parse(event.rawData));
		return;
	}
	if (event.status === "matched" && event.housemateId)
		throw new Error(
			`Bank receipt ${event.transactionId} has no bank payload; import its Up transaction before processing this event`,
		);
}

export async function drainLedgerEvents(client: Client): Promise<number> {
	let processed = 0;
	while (true) {
		const count = await withWriteTransaction(client, async (tx) => {
			const events = (
				await tx.execute(
					"SELECT id,kind,payload FROM ledger_events WHERE processed_at IS NULL ORDER BY id LIMIT 1",
				)
			).rows;
			for (const event of events) {
				await processEvent(tx, String(event.kind), String(event.payload));
				await tx.execute({
					sql: "UPDATE ledger_events SET processed_at=? WHERE id=?",
					args: [nowSeconds(), event.id],
				});
			}
			return events.length;
		});
		processed += count;
		if (count === 0) return processed;
	}
}
