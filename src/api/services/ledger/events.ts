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
