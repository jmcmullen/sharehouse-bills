import { createHash } from "node:crypto";
import type { Client } from "@libsql/client";
import {
	type LedgerSource,
	sourceSchema,
	toCents,
	utilityPattern,
} from "./model";

type Executor = Pick<Client, "execute">;
export interface BillPaymentView {
	id: string;
	name: string;
	category: string;
	dueAt: number | null;
	amountCents: number;
	paidCents: number;
	remainingCents: number;
	legacyPaidCents: number;
	payments: Array<{ receiptId: string; amountCents: number }>;
}
export interface ReceiptView {
	id: string;
	sourceKeys: string[];
	description: string;
	amountCents: number;
	receivedAt: number;
	receivedDateKnown: boolean;
	recordedAt: number;
	bankMatched: boolean;
	manual: boolean;
	rentOnly: boolean;
	allocations: Array<{ debtId: string; amountCents: number }>;
	unallocatedCents: number;
	allocationIssue: string | null;
}
export interface AccountPayments {
	revision: string;
	bills: BillPaymentView[];
	receipts: ReceiptView[];
	unallocatedCents: number;
	unpaidCents: number;
	allocationReviewCount: number;
}
interface CurrentSource extends LedgerSource {
	key: string;
	recordedAt: number;
}

export async function getAccountPayments(
	client: Executor,
	housemateId: string,
	now = Math.floor(Date.now() / 1000),
): Promise<AccountPayments> {
	const results = await Promise.all([
		client.execute({
			sql: "SELECT s.source_key,s.snapshot,e.recorded_at FROM ledger_sources s JOIN ledger_entries e ON e.id=s.entry_id WHERE e.housemate_id=? AND e.effective_at<=? ORDER BY e.effective_at,s.source_key",
			args: [housemateId, now],
		}),
		client.execute({
			sql: "SELECT a.source_key,a.debt_id,a.amount_cents FROM ledger_bill_allocations a JOIN ledger_sources s ON s.source_key=a.source_key WHERE s.entry_id IS NOT NULL AND json_extract(s.snapshot,'$.housemateId')=?",
			args: [housemateId],
		}),
		client.execute({
			sql: "SELECT d.id,d.amount_paid,b.bill_type,b.stack_group FROM debts d JOIN bills b ON b.id=d.bill_id WHERE d.housemate_id=?",
			args: [housemateId],
		}),
		client.execute({
			sql: "SELECT e.source_key,e.transaction_id,b.effective_at,b.message FROM ledger_payment_evidence e JOIN ledger_bank_transactions b ON b.id=e.transaction_id JOIN ledger_sources s ON s.source_key=e.source_key WHERE b.decision='linked' AND json_extract(s.snapshot,'$.housemateId')=?",
			args: [housemateId],
		}),
		client.execute({
			sql: "SELECT i.source_key,i.reason FROM ledger_allocation_issues i JOIN ledger_sources s ON s.source_key=i.source_key WHERE json_extract(s.snapshot,'$.housemateId')=?",
			args: [housemateId],
		}),
	]);
	const sources: CurrentSource[] = results[0].rows.map((row) => ({
		key: String(row.source_key),
		recordedAt: Number(row.recorded_at),
		...sourceSchema.parse(JSON.parse(String(row.snapshot))),
	}));
	const evidence = new Map(
		results[3].rows.map((row) => [
			String(row.source_key),
			{
				id: String(row.transaction_id),
				receivedAt: Number(row.effective_at),
				message: String(row.message),
			},
		]),
	);
	const allocationRows = results[1].rows.map((row) => ({
		key: String(row.source_key),
		debtId: String(row.debt_id),
		amountCents: Number(row.amount_cents),
	}));
	const issues = new Map(
		results[4].rows.map((row) => [String(row.source_key), String(row.reason)]),
	);
	const receipts = buildReceipts(sources, evidence, allocationRows, issues);
	const bills = sources
		.filter((source) => source.kind === "charge")
		.map((source) => {
			const id = source.key.slice(7);
			const legacy = results[2].rows.find((row) => row.id === id);
			const payments = receipts.flatMap((receipt) =>
				receipt.allocations
					.filter((allocation) => allocation.debtId === id)
					.map((allocation) => ({
						receiptId: receipt.id,
						amountCents: allocation.amountCents,
					})),
			);
			const paidCents = payments.reduce(
				(sum, payment) => sum + payment.amountCents,
				0,
			);
			return {
				id,
				name: source.description,
				category: String(legacy?.bill_type ?? legacy?.stack_group ?? "bill"),
				dueAt: source.dueAt,
				amountCents: source.amountCents,
				paidCents,
				remainingCents: Math.max(0, source.amountCents - paidCents),
				legacyPaidCents: toCents(Number(legacy?.amount_paid ?? 0)),
				payments,
			};
		})
		.sort(
			(a, b) => (b.dueAt ?? 0) - (a.dueAt ?? 0) || a.id.localeCompare(b.id),
		);
	return {
		revision: createHash("sha256")
			.update(JSON.stringify(results.map((result) => result.rows)))
			.digest("hex"),
		bills,
		receipts,
		unallocatedCents: receipts.reduce(
			(sum, receipt) => sum + receipt.unallocatedCents,
			0,
		),
		unpaidCents: bills.reduce((sum, bill) => sum + bill.remainingCents, 0),
		allocationReviewCount: bills.filter(
			(bill) =>
				bill.legacyPaidCents > bill.paidCents ||
				bill.paidCents > bill.amountCents ||
				bill.paidCents < 0,
		).length,
	};
}

function buildReceipts(
	sources: CurrentSource[],
	evidence: Map<string, { id: string; receivedAt: number; message: string }>,
	allocations: Array<{ key: string; debtId: string; amountCents: number }>,
	issues: Map<string, string>,
): ReceiptView[] {
	const groups = new Map<string, CurrentSource[]>();
	for (const source of sources.filter((item) => item.kind !== "charge")) {
		const match = evidence.get(source.key);
		const id = match ? `bank:${match.id}` : source.key;
		groups.set(id, [...(groups.get(id) ?? []), source]);
	}
	return [...groups]
		.map(([id, parts]) => {
			const first = parts[0];
			const match = evidence.get(first.key);
			const sourceKeys = parts.map((part) => part.key);
			const grouped = new Map<string, number>();
			for (const allocation of allocations.filter((item) =>
				sourceKeys.includes(item.key),
			))
				grouped.set(
					allocation.debtId,
					(grouped.get(allocation.debtId) ?? 0) + allocation.amountCents,
				);
			const billAllocations = [...grouped].map(([debtId, amountCents]) => ({
				debtId,
				amountCents,
			}));
			const amountCents = parts.reduce(
				(sum, part) => sum - part.amountCents,
				0,
			);
			const description = match
				? `Payment received${match.message ? ` · ${match.message}` : ""}`
				: first.description;
			const manual = first.key.startsWith("manual:");
			return {
				id,
				sourceKeys,
				description,
				amountCents,
				receivedAt: match?.receivedAt ?? first.effectiveAt,
				receivedDateKnown:
					Boolean(match) || !manual || first.key.startsWith("manual:ledger-"),
				recordedAt: manual
					? Math.min(
							...parts.map((part) =>
								part.key.startsWith("manual:ledger-")
									? part.recordedAt
									: part.effectiveAt,
							),
						)
					: first.recordedAt,
				bankMatched: Boolean(match) || first.key.startsWith("bank:"),
				manual,
				rentOnly:
					/\brent\b/i.test(description) && !utilityPattern.test(description),
				allocations: billAllocations,
				unallocatedCents:
					amountCents -
					billAllocations.reduce((sum, item) => sum + item.amountCents, 0),
				allocationIssue:
					sourceKeys.map((key) => issues.get(key)).find(Boolean) ?? null,
			};
		})
		.sort((a, b) => b.receivedAt - a.receivedAt || a.id.localeCompare(b.id));
}
