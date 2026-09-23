import type { Client, Transaction } from "@libsql/client";
import {
	releaseBillAllocations,
	restoreLegacyAllocations,
	syncSourceAllocations,
} from "./bill-allocations";
import {
	type AccountStatement,
	type LedgerHousemate,
	type LedgerSource,
	type StatementEntry,
	calculateStatement,
	sourceSchema,
} from "./model";

export type Executor = Pick<Client, "execute">;
export const nowSeconds = (): number => Math.floor(Date.now() / 1000);

export async function applySource(
	tx: Executor,
	key: string,
	input: LedgerSource | null,
): Promise<void> {
	const source = input ? sourceSchema.parse(input) : null;
	const previous = (
		await tx.execute({
			sql: "SELECT entry_id,snapshot FROM ledger_sources WHERE source_key=?",
			args: [key],
		})
	).rows[0];
	const snapshot = JSON.stringify(source);
	if (previous?.snapshot === snapshot) return;
	const old = previous
		? sourceSchema.nullable().parse(JSON.parse(String(previous.snapshot)))
		: null;
	await syncSourceAllocations(tx, key, source);
	if (key.startsWith("charge:") && chargeMoved(old, source))
		await releaseBillAllocations(tx, key.slice(7), "debt");
	await journalSource(tx, key, old, source, previous?.entry_id, snapshot);
	if (source?.kind === "payment" || source?.kind === "adjustment")
		await restoreLegacyAllocations(tx, key);
}

function chargeMoved(
	old: LedgerSource | null,
	source: LedgerSource | null,
): boolean {
	return !source || (old !== null && old.housemateId !== source.housemateId);
}

// Reverses the previous entry, posts the new one and stores the snapshot.
async function journalSource(
	tx: Executor,
	key: string,
	old: LedgerSource | null,
	source: LedgerSource | null,
	previousEntryId: unknown,
	snapshot: string,
): Promise<void> {
	if (previousEntryId && old)
		await insertEntry(
			tx,
			key,
			{ ...old, amountCents: -old.amountCents },
			String(previousEntryId),
		);
	const entryId =
		source && source.amountCents !== 0
			? await insertEntry(tx, key, source, null)
			: null;
	await tx.execute({
		sql: "INSERT INTO ledger_sources(source_key,entry_id,snapshot) VALUES (?,?,?) ON CONFLICT(source_key) DO UPDATE SET entry_id=excluded.entry_id,snapshot=excluded.snapshot",
		args: [key, entryId, snapshot],
	});
}

async function insertEntry(
	tx: Executor,
	key: string,
	source: LedgerSource,
	reversal: string | null,
): Promise<string> {
	const id = crypto.randomUUID();
	await tx.execute({
		sql: "INSERT INTO ledger_entries(id,housemate_id,source_key,kind,amount_cents,description,bill_id,effective_at,due_at,recorded_at,reverses_entry_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
		args: [
			id,
			source.housemateId,
			key,
			source.kind,
			source.amountCents,
			source.description,
			source.billId,
			source.effectiveAt,
			source.dueAt,
			nowSeconds(),
			reversal,
		],
	});
	return id;
}

export async function loadHousemates(tx: Executor): Promise<LedgerHousemate[]> {
	return (
		await tx.execute("SELECT id,name,bank_alias,is_owner FROM housemates")
	).rows.map((row) => ({
		id: String(row.id),
		name: String(row.name),
		bankAlias: row.bank_alias === null ? null : String(row.bank_alias),
		isOwner: Boolean(row.is_owner),
	}));
}

export async function withWriteTransaction<T>(
	client: Client,
	operation: (tx: Transaction) => Promise<T>,
): Promise<T> {
	const tx = await client.transaction("write");
	try {
		const result = await operation(tx);
		await tx.commit();
		return result;
	} catch (error) {
		await tx.rollback();
		throw error;
	} finally {
		tx.close();
	}
}

export async function getAccountStatement(
	client: Executor,
	housemateId: string,
	now = nowSeconds(),
): Promise<AccountStatement> {
	const rows = (
		await client.execute({
			sql: "SELECT * FROM ledger_entries WHERE housemate_id=? ORDER BY effective_at,recorded_at,id",
			args: [housemateId],
		})
	).rows;
	const entries: StatementEntry[] = rows.map((row) => ({
		id: String(row.id),
		sourceKey: String(row.source_key),
		recordedAt: Number(row.recorded_at),
		reversesEntryId:
			row.reverses_entry_id === null ? null : String(row.reverses_entry_id),
		...sourceSchema.parse({
			housemateId: row.housemate_id,
			amountCents: row.amount_cents,
			kind: row.kind,
			description: row.description,
			billId: row.bill_id,
			effectiveAt: row.effective_at,
			dueAt: row.due_at,
		}),
	}));
	return calculateStatement(entries, now);
}
