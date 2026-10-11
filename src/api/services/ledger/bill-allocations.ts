import type { Client } from "@libsql/client";
import { generateEntityId } from "../../../lib/id";
import { loadBill } from "../account/account.server";
import type { LedgerSource } from "./model";

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
	const billId = await shareBillId(tx, debtId);
	const wasPaid = billId ? await isBillPaid(tx, billId) : true;
	await tx.execute({
		sql: "INSERT INTO ledger_bill_allocations(source_key,debt_id,amount_cents,origin) VALUES (?,?,?,?) ON CONFLICT(source_key,debt_id) DO UPDATE SET amount_cents=amount_cents+excluded.amount_cents,origin=excluded.origin",
		args: [key, debtId, amount, origin],
	});
	await tx.execute({
		sql: "INSERT INTO ledger_allocation_history(source_key,debt_id,amount_cents,origin) VALUES (?,?,?,?)",
		args: [key, debtId, amount, origin],
	});
	if (billId && !wasPaid && (await isBillPaid(tx, billId)))
		await queueBillPaid(tx, billId);
}

async function shareBillId(
	tx: Executor,
	debtId: string,
): Promise<string | null> {
	const row = (
		await tx.execute({
			sql: "SELECT bill_id FROM debts WHERE id=?",
			args: [debtId],
		})
	).rows[0];
	return row ? String(row.bill_id) : null;
}

async function isBillPaid(tx: Executor, billId: string): Promise<boolean> {
	return (await loadBill(billId, { client: tx }))?.status === "paid";
}

// The group chat hears once when the allocation that pays a bill's last share
// commits. Housemates hear about their own payments through the receipt.
async function queueBillPaid(tx: Executor, billId: string): Promise<void> {
	const now = Math.floor(Date.now() / 1000);
	await tx.execute({
		sql: "INSERT INTO whatsapp_notifications(id,event_key,event_type,status,bill_id,payload,created_at,updated_at) VALUES (?,?,'bill_paid','pending',?,?,?,?) ON CONFLICT(event_key) DO NOTHING",
		args: [
			generateEntityId(),
			`bill-paid:${billId}`,
			billId,
			JSON.stringify({ source: "ledger" }),
			now,
			now,
		],
	});
}

export async function releaseBillAllocations(
	tx: Executor,
	key: string,
	kind: "source" | "debt",
): Promise<void> {
	const column = kind === "source" ? "source_key" : "debt_id";
	await tx.execute({
		sql: `INSERT INTO ledger_allocation_history(source_key,debt_id,amount_cents,origin) SELECT source_key,debt_id,-amount_cents,'released' FROM ledger_bill_allocations WHERE ${column}=?`,
		args: [key],
	});
	await tx.execute({
		sql: `DELETE FROM ledger_bill_allocations WHERE ${column}=?`,
		args: [key],
	});
}
