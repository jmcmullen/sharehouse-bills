import { createServerFn } from "@tanstack/react-start";
import { getAccountPayments } from "../api/services/ledger/account-payments";
import {
	allocateReceipt,
	allocateReceiptSchema,
	recordReceipt,
	recordReceiptSchema,
} from "../api/services/ledger/allocation-actions";
import { createLedgerClient } from "../api/services/ledger/client.server";
import { drainLedgerEvents } from "../api/services/ledger/events";
import { currentStatement } from "../api/services/ledger/model";
import {
	getPaymentReview,
	reviewFiltersSchema,
} from "../api/services/ledger/payment-review-data";
import {
	batchReviewSchema,
	reviewBankTransaction,
	reviewBankTransactions,
	reviewDecisionSchema,
} from "../api/services/ledger/review-decisions";
import { getAccountStatement } from "../api/services/ledger/sources";
import { authMiddleware } from "../lib/auth-middleware";

export const getLedger = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(reviewFiltersSchema)
	.handler(async ({ data }) => {
		const client = createLedgerClient();
		try {
			const available =
				(
					await client.execute(
						"SELECT name FROM sqlite_master WHERE type='table' AND name='ledger_entries'",
					)
				).rows.length > 0;
			if (!available) return { available: false as const };
			await drainLedgerEvents(client);
			const housemates = (
				await client.execute(
					"SELECT id,name FROM housemates WHERE is_owner=0 ORDER BY name",
				)
			).rows.map((row) => ({ id: String(row.id), name: String(row.name) }));
			const accounts = await Promise.all(
				housemates.map(async (housemate) => {
					const statement = await getAccountStatement(client, housemate.id);
					const link = (
						await client.execute({
							sql: "SELECT expires_at FROM ledger_statement_links WHERE housemate_id=?",
							args: [housemate.id],
						})
					).rows[0];
					return {
						...housemate,
						...currentStatement(statement, Math.floor(Date.now() / 1000)),
						auditEntries: statement.entries,
						billing: await getAccountPayments(client, housemate.id),
						linkExpiresAt: link ? Number(link.expires_at) : null,
					};
				}),
			);

			const review = await getPaymentReview(client, data);

			const pendingEvents = Number(
				(
					await client.execute(
						"SELECT count(*) AS count FROM ledger_events WHERE processed_at IS NULL",
					)
				).rows[0].count,
			);
			return {
				available: true as const,
				accounts,
				...review,
				pendingEvents,
			};
		} finally {
			client.close();
		}
	});

export const syncLedger = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.handler(async () => {
		const client = createLedgerClient();
		try {
			return { processed: await drainLedgerEvents(client) };
		} finally {
			client.close();
		}
	});

export const decideLedgerTransaction = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(reviewDecisionSchema)
	.handler(async ({ data }) => {
		const client = createLedgerClient();
		try {
			await reviewBankTransaction(client, data);
			return { success: true };
		} finally {
			client.close();
		}
	});

export const decideLedgerBatch = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(batchReviewSchema)
	.handler(async ({ data }) => {
		const client = createLedgerClient();
		try {
			await reviewBankTransactions(client, data);
			return { success: true };
		} finally {
			client.close();
		}
	});

export const allocateLedgerReceipt = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(allocateReceiptSchema)
	.handler(async ({ data }) => {
		const client = createLedgerClient();
		try {
			await allocateReceipt(client, data);
			return { success: true };
		} finally {
			client.close();
		}
	});

export const recordLedgerReceipt = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(recordReceiptSchema)
	.handler(async ({ data }) => {
		const client = createLedgerClient();
		try {
			await recordReceipt(client, data);
			return { success: true };
		} finally {
			client.close();
		}
	});
