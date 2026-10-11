import type { Client, Row } from "@libsql/client";
import { withLedgerClient } from "../payments/client.server";
import {
	type Account,
	type Bill,
	type BillRow,
	type Housemate,
	type Receipt,
	type ReceiptRow,
	type ShareRow,
	buildAccount,
	buildBill,
	toReceipt,
} from "./account";

type Executor = Pick<Client, "execute">;
interface LoadOptions {
	client?: Executor;
	now?: number;
}
interface AllocationRow {
	receiptId: string;
	debtId: string;
	amountCents: number;
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

const RECEIPT_COLUMNS =
	"r.id,r.housemate_id,r.kind,r.bank_transaction_id,r.note,r.amount_cents,r.received_at,r.recorded_at,r.voided_at,r.void_reason,b.description AS bank_description,b.message AS bank_message";

// A bank receipt reads as the transfer's description and reference; cash reads
// as the admin's note.
function receiptDescription(row: Row): string {
	const parts =
		row.kind === "cash"
			? ["Cash received", row.note]
			: [row.bank_description ?? "Bank transfer", row.bank_message];
	return parts
		.map((part) => (part === null || part === undefined ? "" : String(part)))
		.filter(Boolean)
		.join(" · ");
}

function toReceiptRow(row: Row, allocations: AllocationRow[]): ReceiptRow {
	const id = String(row.id);
	return {
		id,
		kind: row.kind === "cash" ? "cash" : "bank",
		bankTransactionId: nullableText(row.bank_transaction_id),
		description: receiptDescription(row),
		note: String(row.note),
		amountCents: Number(row.amount_cents),
		receivedAt: Number(row.received_at),
		recordedAt: Number(row.recorded_at),
		voidedAt: nullableNumber(row.voided_at),
		voidReason: nullableText(row.void_reason),
		allocations: allocations
			.filter((allocation) => allocation.receiptId === id)
			.map(({ debtId, amountCents }) => ({ debtId, amountCents })),
	};
}

// Live receipts and their allocations. Voided receipts never count.
async function loadReceipts(
	client: Executor,
	ids: string[],
): Promise<Map<string, ReceiptRow[]>> {
	const housemates = `(${placeholders(ids)})`;
	const [receiptRows, allocationRows] = await Promise.all([
		client.execute({
			sql: `SELECT ${RECEIPT_COLUMNS} FROM receipts r LEFT JOIN bank_transactions b ON b.id=r.bank_transaction_id WHERE r.voided_at IS NULL AND r.housemate_id IN ${housemates} ORDER BY r.received_at,r.id`,
			args: ids,
		}),
		client.execute({
			sql: `SELECT a.receipt_id,a.debt_id,a.amount_cents FROM allocations a JOIN receipts r ON r.id=a.receipt_id WHERE r.voided_at IS NULL AND r.housemate_id IN ${housemates}`,
			args: ids,
		}),
	]);
	const allocations = allocationRows.rows.map((row) => ({
		receiptId: String(row.receipt_id),
		debtId: String(row.debt_id),
		amountCents: Number(row.amount_cents),
	}));
	return new Map(
		ids.map((id) => [
			id,
			receiptRows.rows
				.filter((row) => String(row.housemate_id) === id)
				.map((row) => toReceiptRow(row, allocations)),
		]),
	);
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
		loadReceipts(client, housemateIds),
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

// Receipts voided by a later decision, newest first. Only the admin statement
// shows them, as corrections.
export function loadVoidedReceipts(
	housemateId: string,
	options: LoadOptions = {},
): Promise<Receipt[]> {
	return run(options, async (client) => {
		const rows = await client.execute({
			sql: `SELECT ${RECEIPT_COLUMNS} FROM receipts r LEFT JOIN bank_transactions b ON b.id=r.bank_transaction_id WHERE r.voided_at IS NOT NULL AND r.housemate_id=? ORDER BY r.voided_at DESC,r.id`,
			args: [housemateId],
		});
		return rows.rows.map((row) => toReceipt(toReceiptRow(row, [])));
	});
}
