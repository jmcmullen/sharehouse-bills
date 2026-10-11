import { startPendingPaidNotifications } from "../whatsapp-notification-events";
import { enqueuePaymentArrived } from "./arrival-notifications";
import { deleteBankTransaction, ingestBankTransaction } from "./bank-ingest";
import { withLedgerClient } from "./client.server";
import { bankTransactionSchema } from "./model";
import { withWriteTransaction } from "./transaction";

// Ingests a bank transaction from the Up webhook and, when it lands in review,
// tells the owner that money has arrived and is waiting for a decision.
export async function recordBankEvent(transaction: unknown): Promise<void> {
	const { id } = bankTransactionSchema.pick({ id: true }).parse(transaction);
	await withLedgerClient((client) =>
		withWriteTransaction(client, async (tx) => {
			await ingestBankTransaction(tx, transaction);
			await enqueuePaymentArrived(tx, id);
		}),
	);
	await startPendingPaidNotifications();
}

export async function removeBankEvent(transactionId: string): Promise<void> {
	await withLedgerClient((client) =>
		withWriteTransaction(client, (tx) =>
			deleteBankTransaction(tx, transactionId),
		),
	);
}
