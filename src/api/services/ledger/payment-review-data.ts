import type { Client } from "@libsql/client";
import { z } from "zod";
import { bankTransactionSchema, namedBeneficiaries } from "./model";
import { hasPossibleManualMatch } from "./payment-evidence";
import { reviewGroupSql } from "./review-policy";
import { loadHousemates } from "./sources";

export const reviewFiltersSchema = z.object({
	reviewPage: z.number().int().min(0).default(0),
	housemateId: z.string().optional(),
	status: z
		.enum(["review", "credit", "exclude", "linked", "archive"])
		.default("review"),
	scope: z.enum(["all", "known", "unidentified"]).default("all"),
	recentOnly: z.boolean().default(false),
	group: z
		.enum(["all", "purpose", "duplicate", "assignment", "outgoing"])
		.default("all"),
	query: z.string().max(100).default(""),
});

export async function loadPaymentReview(
	client: Pick<Client, "execute">,
	input: z.input<typeof reviewFiltersSchema>,
) {
	const data = reviewFiltersSchema.parse(input);
	const manualPayments = (
		await client.execute(
			"SELECT source_key,snapshot,(SELECT transaction_id FROM ledger_payment_evidence e WHERE e.source_key=ledger_sources.source_key) AS bank_transaction_id FROM ledger_sources WHERE source_key LIKE 'manual:%' AND entry_id IS NOT NULL AND json_extract(snapshot,'$.amountCents')<0",
		)
	).rows.map((row) => ({
		bankTransactionId:
			row.bank_transaction_id === null ? null : String(row.bank_transaction_id),
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
	const matchIds = (
		await client.execute(
			"SELECT id,housemate_id,amount_cents,effective_at FROM ledger_bank_transactions WHERE housemate_id IS NOT NULL AND amount_cents>0 AND (decision='review' OR (decision='credit' AND decision_origin!='review'))",
		)
	).rows
		.filter((bank) =>
			hasPossibleManualMatch(
				manualPayments.filter(
					(manual) =>
						!manual.bankTransactionId &&
						manual.housemateId === bank.housemate_id,
				),
				Number(bank.amount_cents),
				Number(bank.effective_at),
			),
		)
		.map((bank) => String(bank.id));
	const rowsSql =
		"WITH payment_rows AS (SELECT *,id IN (SELECT value FROM json_each(?)) AS match_candidate FROM ledger_bank_transactions)";
	const conditions = [
		data.status === "review"
			? "(decision='review' OR (decision='credit' AND match_candidate))"
			: "decision=?",
	];
	const filterArgs: Array<string | number> = [
		JSON.stringify(matchIds),
		...(data.status === "review" ? [] : [data.status]),
	];
	if (data.housemateId) {
		conditions.push(
			"(housemate_id=? OR id IN (SELECT transaction_id FROM ledger_bank_allocations WHERE housemate_id=?))",
		);
		filterArgs.push(data.housemateId, data.housemateId);
	}
	if (data.scope === "known") conditions.push("housemate_id IS NOT NULL");
	if (data.scope === "unidentified") conditions.push("housemate_id IS NULL");
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
	if (data.group !== "all" && data.status === "review") {
		conditions.push(`(${reviewGroupSql})=?`);
		filterArgs.push(data.group);
	}
	const filter = conditions.join(" AND ");
	const reviewCount = Number(
		(
			await client.execute({
				sql: `${rowsSql} SELECT count(*) AS count FROM payment_rows AS ledger_bank_transactions WHERE ${filter}`,
				args: filterArgs,
			})
		).rows[0].count,
	);
	const housemates = await loadHousemates(client);
	const reviews = (
		await client.execute({
			sql: `${rowsSql} SELECT id,description,message,amount_cents,effective_at,housemate_id,reason,decision,decision_origin,updated_at,bank_status,currency,match_candidate,raw_data,(${reviewGroupSql}) AS review_group,
					json_extract(raw_data,'$.relationships.transferAccount.data') IS NOT NULL AS internal_transfer,
					json_extract(raw_data,'$.attributes.transactionType') AS transaction_type,
					(SELECT json_group_array(source_key) FROM ledger_payment_evidence WHERE transaction_id=ledger_bank_transactions.id) AS manual_keys,
					(SELECT json_group_array(json_object('housemateId',a.housemate_id,'amountCents',a.amount_cents)) FROM ledger_bank_allocations a WHERE a.transaction_id=ledger_bank_transactions.id) AS allocations
					FROM payment_rows AS ledger_bank_transactions WHERE ${filter} ORDER BY effective_at DESC,id LIMIT 25 OFFSET ?`,
			args: [...filterArgs, data.reviewPage * 25],
		})
	).rows.map((row) => ({
		id: String(row.id),
		matchCandidate: Boolean(row.match_candidate),
		group: z
			.enum(["purpose", "duplicate", "assignment", "outgoing"])
			.parse(row.review_group),
		shared:
			namedBeneficiaries(
				bankTransactionSchema.parse(JSON.parse(String(row.raw_data))),
				housemates,
			).length > 1,
		internalTransfer: Boolean(row.internal_transfer),
		transactionType: String(row.transaction_type ?? ""),
		allocations: z
			.array(z.object({ housemateId: z.string(), amountCents: z.number() }))
			.parse(JSON.parse(String(row.allocations))),
		manualSourceKeys: z
			.array(z.string())
			.parse(JSON.parse(String(row.manual_keys))),
		description: String(row.description),
		message: String(row.message),
		amountCents: Number(row.amount_cents),
		effectiveAt: Number(row.effective_at),
		housemateId: row.housemate_id === null ? null : String(row.housemate_id),
		reason: String(row.reason),
		decision: String(row.decision),
		origin: String(row.decision_origin),
		revision: Number(row.updated_at),
		bankStatus: String(row.bank_status),
		currency: String(row.currency),
	}));
	const totalReviewCount = Number(
		(
			await client.execute({
				sql: `${rowsSql} SELECT count(*) AS n FROM payment_rows WHERE (decision='review' OR (decision='credit' AND match_candidate)) AND effective_at >= (SELECT coalesce(min(created_at),0) FROM bills)`,
				args: [JSON.stringify(matchIds)],
			})
		).rows[0].n,
	);

	return { reviews, reviewCount, totalReviewCount, manualPayments };
}
