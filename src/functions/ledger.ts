import type { Client } from "@libsql/client";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
	loadAccount,
	loadVoidedReceipts,
} from "../api/services/account/account.server";
import { buildStatement } from "../api/services/account/statement";
import { toAccountPayments } from "../api/services/payments/account-payments";
import {
	allocateReceipt,
	allocateReceiptSchema,
} from "../api/services/payments/allocate";
import { createLedgerClient } from "../api/services/payments/client.server";
import {
	batchDecisionSchema,
	decideBankTransaction,
	decideBankTransactions,
	decisionSchema,
} from "../api/services/payments/decisions";
import {
	loadPaymentReview,
	reviewFiltersSchema,
} from "../api/services/payments/review-data";
import type { Executor } from "../api/services/payments/transaction";
import { startPendingPaidNotifications } from "../api/services/whatsapp-notification-events";
import { authMiddleware } from "../lib/auth-middleware";

interface Housemate {
	id: string;
	name: string;
}

async function loadHousemates(
	client: Executor,
	housemateId?: string,
): Promise<Housemate[]> {
	const result = await client.execute({
		sql: "SELECT id,name FROM housemates WHERE is_owner=0 AND (?1 IS NULL OR id=?1) ORDER BY name",
		args: [housemateId ?? null],
	});
	return result.rows.map((row) => ({
		id: String(row.id),
		name: String(row.name),
	}));
}

// One housemate's account for the admin: bills and money received, and the
// statement with and without the receipts later decisions voided.
async function loadLedgerAccount(client: Executor, housemate: Housemate) {
	const now = Math.floor(Date.now() / 1000);
	const [account, voided] = await Promise.all([
		loadAccount(housemate.id, { client, now }),
		loadVoidedReceipts(housemate.id, { client }),
	]);
	if (!account) throw new Error("Housemate not found");
	return {
		...housemate,
		balanceCents: account.balanceCents,
		billing: toAccountPayments(account),
		statement: buildStatement(account, now, { admin: { voided: [] } }),
		corrections: buildStatement(account, now, { admin: { voided } }),
	};
}

async function withClient<T>(
	operation: (client: Client) => Promise<T>,
): Promise<T> {
	const client = createLedgerClient();
	try {
		return await operation(client);
	} finally {
		client.close();
	}
}

export const getLedgerAccounts = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(() =>
		withClient(async (client) => {
			const housemates = await loadHousemates(client);
			return Promise.all(
				housemates.map((housemate) => loadLedgerAccount(client, housemate)),
			);
		}),
	);

export const getLedgerAccount = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ housemateId: z.string().min(1) }))
	.handler(({ data }) =>
		withClient(async (client) => {
			const [housemate] = await loadHousemates(client, data.housemateId);
			if (!housemate) throw new Error("Housemate not found");
			return loadLedgerAccount(client, housemate);
		}),
	);

export const getPaymentReview = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(reviewFiltersSchema)
	.handler(({ data }) =>
		withClient((client) => loadPaymentReview(client, data)),
	);

export const decideLedgerTransaction = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(decisionSchema)
	.handler(({ data }) =>
		withClient(async (client) => {
			await decideBankTransaction(client, data);
			await startPendingPaidNotifications();
			return { success: true };
		}),
	);

export const decideLedgerBatch = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(batchDecisionSchema)
	.handler(({ data }) =>
		withClient(async (client) => {
			await decideBankTransactions(client, data);
			await startPendingPaidNotifications();
			return { success: true };
		}),
	);

export const allocateLedgerReceipt = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(allocateReceiptSchema)
	.handler(({ data }) =>
		withClient(async (client) => {
			await allocateReceipt(client, data);
			await startPendingPaidNotifications();
			return { success: true };
		}),
	);
