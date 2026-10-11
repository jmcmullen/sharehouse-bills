import type { Client } from "@libsql/client";
import { z } from "zod";
import { ingestBankTransaction } from "./bank-ingest";
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
	amountCents: z.number().int(),
	effectiveAt: z.number(),
	dueAt: z.number().nullable(),
	description: z.string(),
});

async function processEvent(
	tx: Executor,
	kind: string,
	payload: string,
): Promise<void> {
	if (kind === "bank") {
		await ingestBankTransaction(tx, JSON.parse(payload));
		return;
	}
	if (kind === "charge") {
		await processChargeEvent(tx, chargeEventSchema.parse(JSON.parse(payload)));
		return;
	}
	throw new Error(`Unknown ledger event kind: ${kind}`);
}

async function processChargeEvent(
	tx: Executor,
	event: z.infer<typeof chargeEventSchema>,
): Promise<void> {
	await applySource(
		tx,
		`charge:${event.id}`,
		event.amountCents === 0
			? null
			: {
					housemateId: event.housemateId,
					amountCents: event.amountCents,
					kind: "charge",
					description: event.description,
					billId: event.billId,
					effectiveAt: event.effectiveAt,
					dueAt: event.dueAt,
				},
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
