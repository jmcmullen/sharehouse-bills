import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createLedgerClient } from "../api/services/ledger/client.server";
import { currentStatement } from "../api/services/ledger/model";
import {
	drainLedgerEvents,
	getAccountStatement,
	reviewBankTransaction,
	reviewDecisionSchema,
} from "../api/services/ledger/store";
import { authMiddleware } from "../lib/auth-middleware";

export const getLedger = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			reviewPage: z.number().int().min(0).default(0),
			housemateId: z.string().optional(),
			status: z
				.enum(["review", "credit", "exclude", "linked"])
				.default("review"),
			scope: z.enum(["all", "known", "unidentified"]).default("all"),
			recentOnly: z.boolean().default(false),
			query: z.string().max(100).default(""),
		}),
	)
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
						linkExpiresAt: link ? Number(link.expires_at) : null,
					};
				}),
			);

			const conditions = ["decision=?"];
			const filterArgs: Array<string | number> = [data.status];
			if (data.housemateId) {
				conditions.push("housemate_id=?");
				filterArgs.push(data.housemateId);
			}
			if (data.scope === "known") conditions.push("housemate_id IS NOT NULL");
			if (data.scope === "unidentified")
				conditions.push("housemate_id IS NULL");
			if (data.recentOnly)
				conditions.push(
					"effective_at >= (SELECT coalesce(min(created_at),0) FROM bills)",
				);
			if (data.query) {
				conditions.push(
					"instr(lower(description||' '||message||' '||id),lower(?))>0",
				);
				filterArgs.push(data.query);
			}
			const filter = conditions.join(" AND ");
			const reviewCount = Number(
				(
					await client.execute({
						sql: `SELECT count(*) AS count FROM ledger_bank_transactions WHERE ${filter}`,
						args: filterArgs,
					})
				).rows[0].count,
			);
			const reviews = (
				await client.execute({
					sql: `SELECT id,description,message,amount_cents,effective_at,housemate_id,reason,decision,decision_origin,updated_at,bank_status,currency FROM ledger_bank_transactions WHERE ${filter} ORDER BY effective_at DESC,id LIMIT 25 OFFSET ?`,
					args: [...filterArgs, data.reviewPage * 25],
				})
			).rows.map((row) => ({
				id: String(row.id),
				description: String(row.description),
				message: String(row.message),
				amountCents: Number(row.amount_cents),
				effectiveAt: Number(row.effective_at),
				housemateId:
					row.housemate_id === null ? null : String(row.housemate_id),
				reason: String(row.reason),
				decision: String(row.decision),
				origin: String(row.decision_origin),
				revision: Number(row.updated_at),
				bankStatus: String(row.bank_status),
				currency: String(row.currency),
			}));
			const totalReviewCount = Number(
				(
					await client.execute(
						"SELECT count(*) AS n FROM ledger_bank_transactions WHERE decision='review'",
					)
				).rows[0].n,
			);

			const manualPayments = (
				await client.execute(
					"SELECT source_key,snapshot FROM ledger_sources WHERE source_key LIKE 'manual:%' AND entry_id IS NOT NULL AND json_extract(snapshot,'$.amountCents')<0 AND source_key NOT IN (SELECT linked_source_key FROM ledger_bank_transactions WHERE linked_source_key IS NOT NULL)",
				)
			).rows.map((row) => ({
				key: String(row.source_key),
				...z
					.object({
						housemateId: z.string(),
						amountCents: z.number(),
						description: z.string(),
						effectiveAt: z.number(),
					})
					.parse(JSON.parse(String(row.snapshot))),
			}));
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
				reviews,
				reviewCount,
				totalReviewCount,
				manualPayments,
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
