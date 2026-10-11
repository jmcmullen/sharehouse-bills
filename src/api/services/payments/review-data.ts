import { z } from "zod";
import {
	type AccountPayments,
	getAccountPayments,
	suggestBankReceipt,
} from "./account-payments";
import { loadHousemates } from "./housemates";
import { bankTransactionSchema, namedBeneficiaries } from "./model";
import {
	type ReviewGroup,
	reviewFiltersSchema,
	reviewGroupSql,
	reviewGroups,
} from "./review-policy";
import type { Suggestion } from "./suggestions";
import type { Executor } from "./transaction";

interface ReviewAccount {
	id: string;
	name: string;
	billing: AccountPayments;
}

const allocationsSchema = z.array(
	z.object({ housemateId: z.string(), amountCents: z.number() }),
);

export async function loadPaymentReview(
	client: Executor,
	input: z.input<typeof reviewFiltersSchema>,
) {
	const data = reviewFiltersSchema.parse(input);
	const accounts = await loadReviewAccounts(client);
	const suggestions = await loadSuggestions(client, accounts);
	const suggestedIds = [...suggestions]
		.filter(([, suggestion]) => suggestion.confidence !== "partial")
		.map(([id]) => id);
	const rowsSql =
		"WITH payment_rows AS (SELECT *,id IN (SELECT value FROM json_each(?)) AS suggested FROM bank_transactions)";
	const { filter, args } = reviewFilter(data, JSON.stringify(suggestedIds));
	const reviewCount = Number(
		(
			await client.execute({
				sql: `${rowsSql} SELECT count(*) AS count FROM payment_rows AS bank_transactions WHERE ${filter}`,
				args,
			})
		).rows[0].count,
	);
	const housemates = await loadHousemates(client);
	const reviews = (
		await client.execute({
			sql: `${rowsSql} SELECT id,description,message,amount_cents,effective_at,housemate_id,reason,decision,decided_at,updated_at,bank_status,currency,raw_data,(${reviewGroupSql}) AS review_group,
					json_extract(raw_data,'$.relationships.transferAccount.data') IS NOT NULL AS internal_transfer,
					json_extract(raw_data,'$.attributes.transactionType') AS transaction_type,
					(SELECT json_group_array(json_object('housemateId',r.housemate_id,'amountCents',r.amount_cents)) FROM receipts r WHERE r.bank_transaction_id=bank_transactions.id AND r.voided_at IS NULL) AS allocations
					FROM payment_rows AS bank_transactions WHERE ${filter} ORDER BY effective_at DESC,id LIMIT 25 OFFSET ?`,
			args: [...args, data.reviewPage * 25],
		})
	).rows.map((row) => ({
		id: String(row.id),
		group: z
			.enum(Object.keys(reviewGroups) as [ReviewGroup])
			.parse(row.review_group),
		suggestion: suggestions.get(String(row.id)) ?? null,
		shared:
			namedBeneficiaries(
				bankTransactionSchema.parse(JSON.parse(String(row.raw_data))),
				housemates,
			).length > 1,
		internalTransfer: Boolean(row.internal_transfer),
		transactionType: String(row.transaction_type ?? ""),
		allocations: allocationsSchema.parse(JSON.parse(String(row.allocations))),
		description: String(row.description),
		message: String(row.message),
		amountCents: Number(row.amount_cents),
		effectiveAt: Number(row.effective_at),
		housemateId: row.housemate_id === null ? null : String(row.housemate_id),
		reason: String(row.reason),
		decision: String(row.decision),
		decided: row.decided_at !== null,
		revision: Number(row.updated_at),
		bankStatus: String(row.bank_status),
		currency: String(row.currency),
	}));
	const totalReviewCount = Number(
		(
			await client.execute(
				"SELECT count(*) AS n FROM bank_transactions WHERE decision='review' AND effective_at >= (SELECT coalesce(min(created_at),0) FROM bills)",
			)
		).rows[0].n,
	);
	return { reviews, reviewCount, totalReviewCount, accounts };
}

function reviewFilter(
	data: z.infer<typeof reviewFiltersSchema>,
	suggestedIds: string,
): { filter: string; args: Array<string | number> } {
	const conditions = ["decision=?"];
	const args: Array<string | number> = [suggestedIds, data.status];
	if (data.housemateId) {
		conditions.push(
			"(housemate_id=? OR id IN (SELECT bank_transaction_id FROM receipts WHERE housemate_id=? AND voided_at IS NULL))",
		);
		args.push(data.housemateId, data.housemateId);
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
		args.push(data.query);
	}
	if (data.group !== "all" && data.status === "review") {
		conditions.push(`(${reviewGroupSql})=?`);
		args.push(data.group);
	}
	return { filter: conditions.join(" AND "), args };
}

// The live proposal for every identified payment waiting for review.
async function loadSuggestions(
	client: Executor,
	accounts: ReviewAccount[],
): Promise<Map<string, Suggestion>> {
	const candidates = (
		await client.execute(
			"SELECT id,housemate_id,amount_cents,effective_at,message FROM bank_transactions WHERE housemate_id IS NOT NULL AND amount_cents>0 AND decision='review'",
		)
	).rows;
	return new Map(
		candidates.flatMap((row) => {
			const account = accounts.find(
				(item) => item.id === String(row.housemate_id),
			);
			const suggestion = account
				? suggestBankReceipt(account.billing, {
						amountCents: Number(row.amount_cents),
						receivedAt: Number(row.effective_at),
						message: String(row.message),
					})
				: null;
			return suggestion ? [[String(row.id), suggestion] as const] : [];
		}),
	);
}

// Every non-owner housemate with their open bills, loaded once so each review
// row can carry its proposal.
async function loadReviewAccounts(client: Executor): Promise<ReviewAccount[]> {
	const housemates = (
		await client.execute(
			"SELECT id,name FROM housemates WHERE is_owner=0 ORDER BY name",
		)
	).rows;
	return Promise.all(
		housemates.map(async (row) => ({
			id: String(row.id),
			name: String(row.name),
			billing: await getAccountPayments(client, String(row.id)),
		})),
	);
}
