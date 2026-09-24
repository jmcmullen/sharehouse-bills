import type { Client } from "@libsql/client";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { settleLedger } from "../api/services/ledger-sync.server";
import {
	getAccountPayments,
	upcomingUnpaidCents,
} from "../api/services/ledger/account-payments";
import {
	allocateReceipt,
	allocateReceiptSchema,
	recordReceipt,
	recordReceiptSchema,
} from "../api/services/ledger/allocation-actions";
import { createLedgerClient } from "../api/services/ledger/client.server";
import {
	confirmReceipt,
	confirmReceiptSchema,
} from "../api/services/ledger/confirm-receipt";
import { drainLedgerEvents } from "../api/services/ledger/events";
import { currentStatement, withUpcoming } from "../api/services/ledger/model";
import {
	loadPaymentReview,
	reviewFiltersSchema,
} from "../api/services/ledger/payment-review-data";
import {
	batchReviewSchema,
	reviewBankTransaction,
	reviewBankTransactions,
	reviewDecisionSchema,
} from "../api/services/ledger/review-decisions";
import {
	type Executor,
	getAccountStatement,
	nowSeconds,
} from "../api/services/ledger/sources";
import { startPendingPaidNotifications } from "../api/services/whatsapp-notification-events";
import { authMiddleware } from "../lib/auth-middleware";

interface Housemate {
	id: string;
	name: string;
}

async function ledgerAvailable(client: Executor): Promise<boolean> {
	const tables = await client.execute(
		"SELECT name FROM sqlite_master WHERE type='table' AND name='ledger_entries'",
	);
	return tables.rows.length > 0;
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

async function loadAccount(client: Executor, housemate: Housemate) {
	const [statement, billing, links] = await Promise.all([
		getAccountStatement(client, housemate.id),
		getAccountPayments(client, housemate.id),
		client.execute({
			sql: "SELECT expires_at FROM ledger_statement_links WHERE housemate_id=?",
			args: [housemate.id],
		}),
	]);
	const link = links.rows[0];
	return {
		...housemate,
		...withUpcoming(
			currentStatement(statement, nowSeconds()),
			upcomingUnpaidCents(billing, nowSeconds()),
		),
		auditEntries: statement.entries,
		billing,
		linkExpiresAt: link ? Number(link.expires_at) : null,
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
			if (!(await ledgerAvailable(client)))
				return { available: false as const };
			await drainLedgerEvents(client);
			const housemates = await loadHousemates(client);
			const accounts = await Promise.all(
				housemates.map((housemate) => loadAccount(client, housemate)),
			);
			return { available: true as const, accounts };
		}),
	);

export const getLedgerAccount = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ housemateId: z.string().min(1) }))
	.handler(({ data }) =>
		withClient(async (client) => {
			await drainLedgerEvents(client);
			const [housemate] = await loadHousemates(client, data.housemateId);
			if (!housemate) throw new Error("Housemate not found");
			return loadAccount(client, housemate);
		}),
	);

export const getPaymentReview = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(reviewFiltersSchema)
	.handler(({ data }) =>
		withClient(async (client) => {
			if (!(await ledgerAvailable(client)))
				return { available: false as const };
			return {
				available: true as const,
				...(await loadPaymentReview(client, data)),
			};
		}),
	);

export const syncLedger = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.handler(async () => ({ processed: await settleLedger() }));

export const decideLedgerTransaction = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(reviewDecisionSchema)
	.handler(({ data }) =>
		withClient(async (client) => {
			await reviewBankTransaction(client, data);
			await startPendingPaidNotifications();
			return { success: true };
		}),
	);

export const decideLedgerBatch = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(batchReviewSchema)
	.handler(({ data }) =>
		withClient(async (client) => {
			await reviewBankTransactions(client, data);
			await startPendingPaidNotifications();
			return { success: true };
		}),
	);

export const confirmLedgerReceipt = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(confirmReceiptSchema)
	.handler(({ data }) =>
		withClient(async (client) => {
			await confirmReceipt(client, data);
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

export const recordLedgerReceipt = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(recordReceiptSchema)
	.handler(({ data }) =>
		withClient(async (client) => {
			await recordReceipt(client, data);
			await startPendingPaidNotifications();
			return { success: true };
		}),
	);
