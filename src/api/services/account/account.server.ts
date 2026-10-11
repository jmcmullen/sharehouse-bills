import type { Client } from "@libsql/client";
import { withLedgerClient } from "../ledger/client.server";
import { type LedgerSource, sourceSchema } from "../ledger/model";
import {
	type Account,
	type Bill,
	type BillRow,
	type Housemate,
	type ReceiptRow,
	type ShareRow,
	buildAccount,
	buildBill,
} from "./account";

type Executor = Pick<Client, "execute">;
interface LoadOptions {
	client?: Executor;
	now?: number;
}
interface Source extends LedgerSource {
	key: string;
	recordedAt: number;
}
interface Evidence {
	id: string;
	receivedAt: number;
	message: string;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

function placeholders(ids: string[]): string {
	return ids.map(() => "?").join(",");
}

function nullableNumber(value: unknown): number | null {
	return value === null || value === undefined ? null : Number(value);
}

function nullableText(value: unknown): string | null {
	return value === null || value === undefined ? null : String(value);
}

async function run<T>(
	options: LoadOptions,
	load: (client: Executor, now: number) => Promise<T>,
): Promise<T> {
	const now = options.now ?? nowSeconds();
	return options.client
		? load(options.client, now)
		: withLedgerClient((client) => load(client, now));
}

async function loadHousemates(
	client: Executor,
	ids: string[] | null,
): Promise<Housemate[]> {
	const rows = (
		await client.execute({
			sql: `SELECT id,name,is_owner FROM housemates${ids ? ` WHERE id IN (${placeholders(ids)})` : ""} ORDER BY name,id`,
			args: ids ?? [],
		})
	).rows;
	return rows.map((row) => ({
		id: String(row.id),
		name: String(row.name),
		isOwner: Boolean(row.is_owner),
	}));
}

const BILL_COLUMNS =
	"b.id AS bill_id,b.biller_name,b.bill_type,b.stack_group,b.due_date,b.bill_period_start,b.bill_period_end,r.templateName AS template_name";

async function loadShares(
	client: Executor,
	ids: string[],
): Promise<ShareRow[]> {
	const rows = (
		await client.execute({
			sql: `SELECT d.id,d.housemate_id,d.amount_cents,h.is_owner,${BILL_COLUMNS},coalesce(b.bill_type,b.stack_group,r.templateName,'bill') AS category FROM debts d JOIN bills b ON b.id=d.bill_id JOIN housemates h ON h.id=d.housemate_id LEFT JOIN recurringBills r ON r.id=b.recurring_bill_id WHERE d.housemate_id IN (${placeholders(ids)})`,
			args: ids,
		})
	).rows;
	return rows.map((row) => ({
		id: String(row.id),
		billId: String(row.bill_id),
		housemateId: String(row.housemate_id),
		isOwner: Boolean(row.is_owner),
		name: String(row.biller_name),
		billType: nullableText(row.bill_type) as ShareRow["billType"],
		category: String(row.category),
		stackGroup: nullableText(row.stack_group),
		recurringTemplateName: nullableText(row.template_name),
		dueAt: Number(row.due_date),
		billPeriodStart: nullableNumber(row.bill_period_start),
		billPeriodEnd: nullableNumber(row.bill_period_end),
		amountCents: Number(row.amount_cents),
	}));
}

// Receipts are the live payment, refund and adjustment sources in the journal.
// A bank transfer split across sources is one receipt.
async function loadReceipts(
	client: Executor,
	ids: string[],
	now: number,
): Promise<Map<string, ReceiptRow[]>> {
	const housemates = `(${placeholders(ids)})`;
	const [sourceRows, allocationRows, evidenceRows] = await Promise.all([
		client.execute({
			sql: `SELECT s.source_key,s.snapshot,e.recorded_at FROM ledger_sources s JOIN ledger_entries e ON e.id=s.entry_id WHERE e.kind!='charge' AND e.housemate_id IN ${housemates} AND e.effective_at<=? ORDER BY e.effective_at,s.source_key`,
			args: [...ids, now],
		}),
		client.execute({
			sql: `SELECT a.source_key,a.debt_id,a.amount_cents FROM ledger_bill_allocations a JOIN ledger_sources s ON s.source_key=a.source_key WHERE s.entry_id IS NOT NULL AND json_extract(s.snapshot,'$.housemateId') IN ${housemates}`,
			args: ids,
		}),
		client.execute({
			sql: `SELECT e.source_key,e.transaction_id,b.effective_at,b.message FROM ledger_payment_evidence e JOIN ledger_bank_transactions b ON b.id=e.transaction_id JOIN ledger_sources s ON s.source_key=e.source_key WHERE b.decision='linked' AND json_extract(s.snapshot,'$.housemateId') IN ${housemates}`,
			args: ids,
		}),
	]);
	const sources: Source[] = sourceRows.rows.map((row) => ({
		key: String(row.source_key),
		recordedAt: Number(row.recorded_at),
		...sourceSchema.parse(JSON.parse(String(row.snapshot))),
	}));
	const evidence = new Map<string, Evidence>(
		evidenceRows.rows.map((row) => [
			String(row.source_key),
			{
				id: String(row.transaction_id),
				receivedAt: Number(row.effective_at),
				message: String(row.message),
			},
		]),
	);
	const allocations = allocationRows.rows.map((row) => ({
		key: String(row.source_key),
		debtId: String(row.debt_id),
		amountCents: Number(row.amount_cents),
	}));
	return new Map(
		ids.map((id) => [
			id,
			buildReceipts(
				sources.filter((source) => source.housemateId === id),
				evidence,
				allocations,
			),
		]),
	);
}

function groupSources(
	sources: Source[],
	evidence: Map<string, Evidence>,
): Map<string, Source[]> {
	return sources.reduce((groups, source) => {
		const match = evidence.get(source.key);
		const id = match ? `bank:${match.id}` : source.key;
		return new Map(groups).set(id, [...(groups.get(id) ?? []), source]);
	}, new Map<string, Source[]>());
}

function receiptAllocations(
	keys: string[],
	allocations: Array<{ key: string; debtId: string; amountCents: number }>,
) {
	const grouped = allocations
		.filter((item) => keys.includes(item.key))
		.reduce(
			(totals, item) =>
				new Map(totals).set(
					item.debtId,
					(totals.get(item.debtId) ?? 0) + item.amountCents,
				),
			new Map<string, number>(),
		);
	return [...grouped].map(([debtId, amountCents]) => ({
		debtId,
		amountCents,
	}));
}

function buildReceipts(
	sources: Source[],
	evidence: Map<string, Evidence>,
	allocations: Array<{ key: string; debtId: string; amountCents: number }>,
): ReceiptRow[] {
	return [...groupSources(sources, evidence)].map(([id, parts]) => {
		const first = parts[0];
		const match = evidence.get(first.key);
		const sourceKeys = parts.map((part) => part.key);
		const manual = first.key.startsWith("manual:");
		return {
			id,
			sourceKeys,
			description: match
				? `Payment received${match.message ? ` · ${match.message}` : ""}`
				: first.description,
			// Journal payments are negative; a receipt is money in.
			amountCents: -parts.reduce((total, part) => total + part.amountCents, 0),
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
			cash: sourceKeys.some((key) => key.startsWith("manual:cash-")),
			allocations: receiptAllocations(sourceKeys, allocations),
		};
	});
}

async function loadAccountsFor(
	client: Executor,
	ids: string[] | null,
	now: number,
): Promise<Account[]> {
	const housemates = await loadHousemates(client, ids);
	if (!housemates.length) return [];
	const housemateIds = housemates.map((housemate) => housemate.id);
	const [shares, receipts] = await Promise.all([
		loadShares(client, housemateIds),
		loadReceipts(client, housemateIds, now),
	]);
	return housemates.map((housemate) =>
		buildAccount({
			housemate,
			shares: shares.filter((share) => share.housemateId === housemate.id),
			receipts: receipts.get(housemate.id) ?? [],
			now,
		}),
	);
}

async function loadBillRows(
	client: Executor,
	billId: string | null,
): Promise<BillRow[]> {
	const rows = (
		await client.execute({
			sql: `SELECT ${BILL_COLUMNS},b.total_cents FROM bills b LEFT JOIN recurringBills r ON r.id=b.recurring_bill_id${billId ? " WHERE b.id=?" : ""} ORDER BY b.due_date DESC,b.id`,
			args: billId ? [billId] : [],
		})
	).rows;
	return rows.map((row) => ({
		id: String(row.bill_id),
		name: String(row.biller_name),
		totalCents: Number(row.total_cents),
		dueAt: Number(row.due_date),
		billType: nullableText(row.bill_type) as BillRow["billType"],
		stackGroup: nullableText(row.stack_group),
		recurringTemplateName: nullableText(row.template_name),
		billPeriodStart: nullableNumber(row.bill_period_start),
		billPeriodEnd: nullableNumber(row.bill_period_end),
	}));
}

async function billHousemates(
	client: Executor,
	billId: string,
): Promise<string[]> {
	return (
		await client.execute({
			sql: "SELECT DISTINCT housemate_id FROM debts WHERE bill_id=?",
			args: [billId],
		})
	).rows.map((row) => String(row.housemate_id));
}

export function loadAccount(
	housemateId: string,
	options: LoadOptions = {},
): Promise<Account | null> {
	return run(options, async (client, now) => {
		const [account] = await loadAccountsFor(client, [housemateId], now);
		return account ?? null;
	});
}

// Every housemate's account, owners included, ordered by name.
export function loadAccounts(options: LoadOptions = {}): Promise<Account[]> {
	return run(options, (client, now) => loadAccountsFor(client, null, now));
}

export function loadBill(
	billId: string,
	options: LoadOptions = {},
): Promise<Bill | null> {
	return run(options, async (client, now) => {
		const [row] = await loadBillRows(client, billId);
		if (!row) return null;
		const ids = await billHousemates(client, billId);
		const accounts = ids.length ? await loadAccountsFor(client, ids, now) : [];
		return buildBill(row, accounts);
	});
}

// Every bill, newest due first, with each housemate's share.
export function loadBills(options: LoadOptions = {}): Promise<Bill[]> {
	return run(options, async (client, now) => {
		const [rows, accounts] = await Promise.all([
			loadBillRows(client, null),
			loadAccountsFor(client, null, now),
		]);
		return rows.map((row) => buildBill(row, accounts));
	});
}
