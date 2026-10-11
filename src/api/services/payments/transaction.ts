import type { Client, Transaction } from "@libsql/client";

export type Executor = Pick<Client, "execute">;

export const nowSeconds = (): number => Math.floor(Date.now() / 1000);

// Runs every write for one decision in a single transaction: it either all
// commits or none of it does.
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
