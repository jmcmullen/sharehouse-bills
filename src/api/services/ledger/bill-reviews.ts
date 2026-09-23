import type { Client } from "@libsql/client";

type Executor = Pick<Client, "execute">;

// An admin's tick that a bill's payments look right. It is a statement about
// the bill as reviewed, not a lock: allocations can still change afterwards.
export async function approveBill(
	client: Executor,
	billId: string,
	approved: boolean,
): Promise<void> {
	if (approved)
		await client.execute({
			sql: "INSERT INTO ledger_bill_reviews(bill_id,reviewed_at) VALUES (?,unixepoch()) ON CONFLICT(bill_id) DO NOTHING",
			args: [billId],
		});
	else
		await client.execute({
			sql: "DELETE FROM ledger_bill_reviews WHERE bill_id=?",
			args: [billId],
		});
}

export async function loadApprovedBills(
	client: Executor,
): Promise<Set<string>> {
	const result = await client.execute(
		"SELECT bill_id FROM ledger_bill_reviews",
	);
	return new Set(result.rows.map((row) => String(row.bill_id)));
}
