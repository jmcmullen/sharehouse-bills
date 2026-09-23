import type { Client } from "@libsql/client";
import {
	deleteBankTransaction,
	ingestBankTransaction,
} from "./ledger/bank-ingest";
import { createLedgerClient } from "./ledger/client.server";
import { drainLedgerEvents } from "./ledger/events";
import { withWriteTransaction } from "./ledger/sources";
import { startPendingPaidNotifications } from "./whatsapp-notification-events";

async function withLedger<T>(run: (client: Client) => Promise<T>): Promise<T> {
	const client = createLedgerClient();
	try {
		return await run(client);
	} finally {
		client.close();
	}
}

// Applies queued charge and payment events so debts and bills reflect the
// ledger, then starts the WhatsApp workflows that paid transitions recorded.
export async function settleLedger(): Promise<number> {
	const processed = await withLedger((client) => drainLedgerEvents(client));
	await startPendingPaidNotifications();
	return processed;
}

export async function recordLedgerBankEvent(
	transaction: unknown,
): Promise<void> {
	await withLedger((client) =>
		withWriteTransaction(client, (tx) =>
			ingestBankTransaction(tx, transaction),
		),
	);
	await startPendingPaidNotifications();
}

export async function removeLedgerBankTransaction(
	transactionId: string,
): Promise<void> {
	await withLedger((client) =>
		withWriteTransaction(client, (tx) =>
			deleteBankTransaction(tx, transactionId),
		),
	);
	await startPendingPaidNotifications();
}
