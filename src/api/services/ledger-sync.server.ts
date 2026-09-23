import type { Client } from "@libsql/client";
import { enqueuePaymentArrived } from "./ledger/arrival-notifications";
import {
	deleteBankTransaction,
	ingestBankTransaction,
} from "./ledger/bank-ingest";
import { createLedgerClient } from "./ledger/client.server";
import { drainLedgerEvents } from "./ledger/events";
import { bankTransactionSchema } from "./ledger/model";
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

// Ingests a bank transaction and, when it lands in review, tells the owner
// that money has arrived and is waiting for a decision.
export async function recordLedgerBankEvent(
	transaction: unknown,
): Promise<void> {
	const { id } = bankTransactionSchema.pick({ id: true }).parse(transaction);
	await withLedger((client) =>
		withWriteTransaction(client, async (tx) => {
			await ingestBankTransaction(tx, transaction);
			await enqueuePaymentArrived(tx, id);
		}),
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
