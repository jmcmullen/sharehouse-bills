import { type Client, createClient } from "@libsql/client";

export function createLedgerClient(): Client {
	return createClient({
		url: process.env.DATABASE_URL ?? "",
		authToken: process.env.DATABASE_AUTH_TOKEN,
	});
}

export async function recordLedgerBankEvent(
	transaction: unknown,
): Promise<void> {
	const { ingestBankTransaction, withWriteTransaction } = await import(
		"./store"
	);
	const client = createLedgerClient();
	try {
		await withWriteTransaction(client, (tx) =>
			ingestBankTransaction(tx, transaction),
		);
	} finally {
		client.close();
	}
}

export async function removeLedgerBankTransaction(
	transactionId: string,
): Promise<void> {
	const { applySource, withWriteTransaction } = await import("./store");
	const client = createLedgerClient();
	try {
		await withWriteTransaction(client, async (tx) => {
			await applySource(tx, `bank:${transactionId}`, null);
			await tx.execute({
				sql: "UPDATE ledger_bank_transactions SET bank_status='DELETED',decision='review',decision_origin='review',reason='Bank transaction deleted; verify any linked manual payment',updated_at=max(updated_at+1,?) WHERE id=?",
				args: [Math.floor(Date.now() / 1000), transactionId],
			});
		});
	} finally {
		client.close();
	}
}
