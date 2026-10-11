import type { Client } from "@libsql/client";
import type { LedgerSource } from "./model";
import { syncPaidState } from "./paid-state";

type Executor = Pick<Client, "execute">;

export async function syncSourceAllocations(
	tx: Executor,
	key: string,
	source: LedgerSource | null,
): Promise<void> {
	const existing = (
		await tx.execute({
			sql: "SELECT a.*,json_extract(s.snapshot,'$.housemateId') AS housemate_id FROM ledger_bill_allocations a JOIN ledger_sources s ON s.source_key=a.source_key WHERE a.source_key=?",
			args: [key],
		})
	).rows;
	if (!existing.length) return;
	const total = existing.reduce(
		(sum, row) => sum + Number(row.amount_cents),
		0,
	);
	if (
		!source ||
		existing.some((row) => row.housemate_id !== source.housemateId) ||
		Math.sign(total) !== Math.sign(-source.amountCents) ||
		Math.abs(total) > Math.abs(source.amountCents)
	) {
		await releaseBillAllocations(tx, key, "source");
	}
}

export async function writeBillAllocation(
	tx: Executor,
	key: string,
	debtId: string,
	amount: number,
	origin: string,
): Promise<void> {
	await tx.execute({
		sql: "INSERT INTO ledger_bill_allocations(source_key,debt_id,amount_cents,origin) VALUES (?,?,?,?) ON CONFLICT(source_key,debt_id) DO UPDATE SET amount_cents=amount_cents+excluded.amount_cents,origin=excluded.origin",
		args: [key, debtId, amount, origin],
	});
	await tx.execute({
		sql: "INSERT INTO ledger_allocation_history(source_key,debt_id,amount_cents,origin) VALUES (?,?,?,?)",
		args: [key, debtId, amount, origin],
	});
	await syncPaidState(tx, [debtId]);
}

export async function releaseBillAllocations(
	tx: Executor,
	key: string,
	kind: "source" | "debt",
): Promise<void> {
	const column = kind === "source" ? "source_key" : "debt_id";
	const debtIds = (
		await tx.execute({
			sql: `SELECT debt_id FROM ledger_bill_allocations WHERE ${column}=?`,
			args: [key],
		})
	).rows.map((row) => String(row.debt_id));
	if (!debtIds.length) return;
	await tx.execute({
		sql: `INSERT INTO ledger_allocation_history(source_key,debt_id,amount_cents,origin) SELECT source_key,debt_id,-amount_cents,'released' FROM ledger_bill_allocations WHERE ${column}=?`,
		args: [key],
	});
	await tx.execute({
		sql: `DELETE FROM ledger_bill_allocations WHERE ${column}=?`,
		args: [key],
	});
	await syncPaidState(tx, debtIds);
}
