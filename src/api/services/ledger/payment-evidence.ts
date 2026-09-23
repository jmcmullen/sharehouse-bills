import type { Client } from "@libsql/client";
import { type BankTransaction, sourceSchema } from "./model";

type Executor = Pick<Client, "execute">;

async function manualPaymentCandidates(
	tx: Executor,
	housemateId: string,
): Promise<
	Array<{
		key: string;
		amountCents: number;
		effectiveAt: number;
		description: string;
	}>
> {
	return (
		await tx.execute({
			sql: `SELECT s.source_key,s.snapshot FROM ledger_sources s WHERE s.source_key LIKE 'manual:%' AND s.entry_id IS NOT NULL
		AND json_extract(s.snapshot,'$.housemateId')=? AND json_extract(s.snapshot,'$.kind')='payment' AND json_extract(s.snapshot,'$.amountCents')<0
		AND NOT EXISTS (SELECT 1 FROM ledger_payment_evidence e WHERE e.source_key=s.source_key)`,
			args: [housemateId],
		})
	).rows.map((row) => ({
		key: String(row.source_key),
		...sourceSchema.parse(JSON.parse(String(row.snapshot))),
	}));
}

export async function possibleManualDuplicate(
	tx: Executor,
	housemateId: string,
	amount: number,
	receivedAt: number,
): Promise<boolean> {
	return hasPossibleManualMatch(
		await manualPaymentCandidates(tx, housemateId),
		amount,
		receivedAt,
	);
}

export function hasPossibleManualMatch(
	payments: Array<{ amountCents: number; effectiveAt: number }>,
	amount: number,
	receivedAt: number,
): boolean {
	if (amount <= 0) return false;
	const candidates = payments.filter(
		(item) =>
			item.effectiveAt >= receivedAt - 7 * 86400 && -item.amountCents <= amount,
	);
	const totals = new Set([0]);
	for (const item of candidates) {
		for (const total of [...totals]) {
			const next = total - item.amountCents;
			if (next === amount) return true;
			if (next < amount) totals.add(next);
		}
		if (totals.size > 10000) return true;
	}
	return false;
}

export async function linkPaymentEvidence(
	tx: Executor,
	transaction: BankTransaction,
	housemateId: string,
	keys: string[],
): Promise<void> {
	if (
		!keys.length ||
		new Set(keys).size !== keys.length ||
		keys.some((key) => !key.startsWith("manual:"))
	)
		throw new Error("Select distinct recorded payments");
	const rows = (
		await tx.execute({
			sql: `SELECT s.source_key,s.snapshot,e.transaction_id FROM ledger_sources s LEFT JOIN ledger_payment_evidence e ON e.source_key=s.source_key WHERE s.entry_id IS NOT NULL AND s.source_key IN (${keys.map(() => "?").join(",")})`,
			args: keys,
		})
	).rows;
	if (rows.length !== keys.length)
		throw new Error("A selected payment is no longer available");
	const sources = rows.map((row) =>
		sourceSchema.parse(JSON.parse(String(row.snapshot))),
	);
	if (
		sources.some(
			(source) =>
				source.housemateId !== housemateId ||
				source.kind !== "payment" ||
				source.amountCents >= 0,
		)
	)
		throw new Error("Select payments received from this housemate");
	if (
		rows.some(
			(row) => row.transaction_id && row.transaction_id !== transaction.id,
		)
	)
		throw new Error("A payment is already matched to another bank transfer");
	if (
		sources.reduce((sum, source) => sum - source.amountCents, 0) !==
		transaction.attributes.amount.valueInBaseUnits
	)
		throw new Error("Selected recorded payments must equal the bank transfer");
	await tx.execute({
		sql: "DELETE FROM ledger_payment_evidence WHERE transaction_id=?",
		args: [transaction.id],
	});
	for (const [index, source] of sources.entries())
		await tx.execute({
			sql: "INSERT INTO ledger_payment_evidence(transaction_id,source_key,amount_cents) VALUES(?,?,?)",
			args: [
				transaction.id,
				String(rows[index].source_key),
				-source.amountCents,
			],
		});
}

export async function validPaymentEvidence(
	tx: Executor,
	transaction: BankTransaction,
	housemateId: string | null,
): Promise<boolean> {
	const rows = (
		await tx.execute({
			sql: "SELECT e.amount_cents,s.snapshot FROM ledger_payment_evidence e LEFT JOIN ledger_sources s ON s.source_key=e.source_key AND s.entry_id IS NOT NULL WHERE e.transaction_id=?",
			args: [transaction.id],
		})
	).rows;
	if (
		!rows.length ||
		rows.reduce((sum, row) => sum + Number(row.amount_cents), 0) !==
			transaction.attributes.amount.valueInBaseUnits
	)
		return false;
	return rows.every((row) => {
		if (!row.snapshot) return false;
		const source = sourceSchema.parse(JSON.parse(String(row.snapshot)));
		return (
			source.housemateId === housemateId &&
			source.kind === "payment" &&
			source.amountCents === -Number(row.amount_cents)
		);
	});
}
