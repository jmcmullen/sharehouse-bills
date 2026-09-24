import type { Client } from "@libsql/client";

type Executor = Pick<Client, "execute">;

// When the money settling each non-owner share arrived: the latest receipt
// allocated to it, dated by the bank when a transfer confirms it, otherwise by
// the receipt's own received date. Shares paid outside the ledger fall back to
// their recorded paid date.
const SHARE_SETTLED_AT = `coalesce(
	(SELECT max(coalesce(t.effective_at,json_extract(s.snapshot,'$.effectiveAt')))
	FROM ledger_bill_allocations a
	JOIN ledger_sources s ON s.source_key=a.source_key AND s.entry_id IS NOT NULL
	LEFT JOIN ledger_payment_evidence e ON e.source_key=a.source_key
	LEFT JOIN ledger_bank_transactions t ON t.id=e.transaction_id AND t.decision='linked'
	WHERE a.debt_id=d.id),
	d.paid_at)`;

async function settledAt(
	client: Executor,
	column: "bill_id" | "id",
	value: string,
): Promise<Date | null> {
	const row = (
		await client.execute({
			sql: `SELECT max(${SHARE_SETTLED_AT}) AS settled_at FROM debts d JOIN housemates h ON h.id=d.housemate_id AND h.is_owner=0 WHERE d.${column}=?`,
			args: [value],
		})
	).rows[0];
	const seconds = row?.settled_at;
	return seconds === null || seconds === undefined
		? null
		: new Date(Number(seconds) * 1000);
}

// The day a bill was paid in full: when its last non-owner share was settled.
export function getBillSettledAt(client: Executor, billId: string) {
	return settledAt(client, "bill_id", billId);
}

export function getDebtSettledAt(client: Executor, debtId: string) {
	return settledAt(client, "id", debtId);
}
