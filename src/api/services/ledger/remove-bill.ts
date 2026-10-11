import type { Client } from "@libsql/client";
import { withWriteTransaction } from "./sources";

// Deletes a bill and its shares in one transaction. The debts triggers queue a
// charge reversal per share; settling the ledger afterwards releases any money
// allocated to those shares back to credit.
export async function removeBill(
	client: Client,
	billId: string,
): Promise<void> {
	await withWriteTransaction(client, async (tx) => {
		await tx.execute({
			sql: "DELETE FROM debts WHERE bill_id=?",
			args: [billId],
		});
		await tx.execute({ sql: "DELETE FROM bills WHERE id=?", args: [billId] });
	});
}
