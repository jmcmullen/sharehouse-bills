import type { Client } from "@libsql/client";
import { releaseAllocations } from "./allocate";
import { withWriteTransaction } from "./transaction";

// Deletes a bill and its shares in one transaction. Money allocated to those
// shares is released back to the housemates' credit first.
export async function removeBill(
	client: Client,
	billId: string,
): Promise<void> {
	await withWriteTransaction(client, async (tx) => {
		const shares = (
			await tx.execute({
				sql: "SELECT id FROM debts WHERE bill_id=?",
				args: [billId],
			})
		).rows;
		for (const share of shares)
			await releaseAllocations(tx, "debt_id", String(share.id));
		await tx.execute({
			sql: "DELETE FROM debts WHERE bill_id=?",
			args: [billId],
		});
		await tx.execute({
			sql: "DELETE FROM bill_reviews WHERE bill_id=?",
			args: [billId],
		});
		await tx.execute({ sql: "DELETE FROM bills WHERE id=?", args: [billId] });
	});
}
