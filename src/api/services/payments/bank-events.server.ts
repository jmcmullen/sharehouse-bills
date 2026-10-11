import { startPendingPaidNotifications } from "../whatsapp-notification-events";
import { deleteBankTransaction, receiveBankTransaction } from "./bank-ingest";
import { withLedgerClient } from "./client.server";
import { withWriteTransaction } from "./transaction";

// Ingests a bank transaction from the Up webhook, then sends whatever it
// queued: the housemate's receipt, or the owner's arrival message.
export async function recordBankEvent(transaction: unknown): Promise<void> {
	await withLedgerClient((client) =>
		withWriteTransaction(client, (tx) =>
			receiveBankTransaction(tx, transaction),
		),
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
