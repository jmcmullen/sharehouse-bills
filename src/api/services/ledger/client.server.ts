import { type Client, createClient } from "@libsql/client";
import { deleteBankTransaction, ingestBankTransaction } from "./bank-ingest";
import { withWriteTransaction } from "./sources";

export function createLedgerClient(): Client {
	return createClient({
		url: process.env.DATABASE_URL ?? "",
		authToken: process.env.DATABASE_AUTH_TOKEN,
	});
}

export async function recordLedgerBankEvent(
	transaction: unknown,
): Promise<void> {
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
	const client = createLedgerClient();
	try {
		await withWriteTransaction(client, (tx) =>
			deleteBankTransaction(tx, transactionId),
		);
	} finally {
		client.close();
	}
}
