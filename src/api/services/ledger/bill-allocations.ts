import type { Client, Row } from "@libsql/client";
import { z } from "zod";
import { type LedgerSource, sourceSchema, toCents } from "./model";

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

export async function restoreLegacyAllocations(
	tx: Executor,
	sourceKey?: string,
): Promise<void> {
	const payments = (
		await tx.execute({
			sql: `SELECT p.matched_debt_ids,p.credit_amount,s.source_key,s.snapshot FROM payment_transactions p
		JOIN ledger_sources s ON s.source_key=CASE WHEN p.source='manual_admin' THEN 'manual:' ELSE 'bank:' END || p.transaction_id
		WHERE s.entry_id IS NOT NULL AND p.status='matched' ${sourceKey ? "AND s.source_key=?" : ""}
		ORDER BY CASE WHEN p.source='manual_admin' THEN 0 ELSE 1 END,json_array_length(coalesce(p.matched_debt_ids,'[]')),p.created_at,p.id`,
			args: sourceKey ? [sourceKey] : [],
		})
	).rows;
	for (const payment of payments) {
		await restorePaymentAllocations(
			tx,
			String(payment.source_key),
			toCents(Number(payment.credit_amount ?? 0)),
			sourceSchema.parse(JSON.parse(String(payment.snapshot))),
			z
				.array(z.string())
				.parse(JSON.parse(String(payment.matched_debt_ids ?? "[]"))),
		);
	}
}

async function restorePaymentAllocations(
	tx: Executor,
	key: string,
	retainedCredit: number,
	source: LedgerSource,
	debtIds: string[],
): Promise<void> {
	if (!debtIds.length || !["payment", "adjustment"].includes(source.kind))
		return;
	if (
		(
			await tx.execute({
				sql: "SELECT 1 FROM ledger_allocation_reviews WHERE source_key=?",
				args: [key],
			})
		).rows.length
	)
		return;
	if (
		(
			await tx.execute({
				sql: "SELECT 1 FROM ledger_bill_allocations WHERE source_key=? LIMIT 1",
				args: [key],
			})
		).rows.length
	)
		return;
	const debts = (
		await tx.execute({
			sql: `SELECT d.id,d.housemate_id,d.amount_owed,coalesce((SELECT sum(amount_cents) FROM ledger_bill_allocations WHERE debt_id=d.id),0) AS allocated FROM debts d WHERE d.id IN (${debtIds.map(() => "?").join(",")})`,
			args: debtIds,
		})
	).rows;
	const remaining = debts.map((debt) => ({
		debtId: String(debt.id),
		amountCents: Math.max(
			0,
			toCents(Number(debt.amount_owed)) - Number(debt.allocated),
		),
	}));
	const received = -source.amountCents - retainedCredit;
	const issue = legacyAllocationIssue(
		debts,
		debtIds,
		source,
		remaining,
		received,
	);
	if (issue) {
		await recordAllocationIssue(tx, key, issue);
		return;
	}
	await clearAllocationIssue(tx, key);
	for (const debt of remaining) {
		const amount =
			remaining.length === 1
				? Math.min(received, debt.amountCents)
				: debt.amountCents;
		if (amount === 0) continue;
		await writeBillAllocation(tx, key, debt.debtId, amount, "legacy");
	}
}

function legacyAllocationIssue(
	debts: Row[],
	debtIds: string[],
	source: LedgerSource,
	remaining: Array<{ amountCents: number }>,
	received: number,
): string | null {
	if (debts.length !== debtIds.length)
		return "A bill share this payment was recorded against no longer exists";
	if (debts.some((debt) => debt.housemate_id !== source.housemateId))
		return "A bill share this payment was recorded against belongs to another housemate";
	const outstanding = remaining.reduce(
		(sum, debt) => sum + debt.amountCents,
		0,
	);
	if (remaining.length > 1 && outstanding !== received)
		return `Recorded bills need ${money(outstanding)} but ${money(received)} was received`;
	return null;
}

function money(cents: number): string {
	return `$${(cents / 100).toFixed(2)}`;
}

async function recordAllocationIssue(
	tx: Executor,
	key: string,
	reason: string,
): Promise<void> {
	await tx.execute({
		sql: "INSERT INTO ledger_allocation_issues(source_key,reason) VALUES (?,?) ON CONFLICT(source_key) DO UPDATE SET reason=excluded.reason,recorded_at=unixepoch()",
		args: [key, reason],
	});
}

export async function clearAllocationIssue(
	tx: Executor,
	key: string,
): Promise<void> {
	await tx.execute({
		sql: "DELETE FROM ledger_allocation_issues WHERE source_key=?",
		args: [key],
	});
}

export async function writeBillAllocation(
	tx: Executor,
	key: string,
	debtId: string,
	amount: number,
	origin: string,
): Promise<void> {
	await clearAllocationIssue(tx, key);
	await tx.execute({
		sql: "INSERT INTO ledger_bill_allocations(source_key,debt_id,amount_cents,origin) VALUES (?,?,?,?)",
		args: [key, debtId, amount, origin],
	});
	await tx.execute({
		sql: "INSERT INTO ledger_allocation_history(source_key,debt_id,amount_cents,origin) VALUES (?,?,?,?)",
		args: [key, debtId, amount, origin],
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
