import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";
import { pushSQLiteSchema } from "drizzle-kit/api";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../../../db/schema";
import { getAccountPayments } from "../account-payments";
import { ingestBankTransaction } from "../bank-ingest";
import { recordCashReceipt } from "../cash";
import { decideBankTransaction } from "../decisions";
import { type BankTransaction, bankTransactionSchema } from "../model";
import { withWriteTransaction } from "../transaction";

export const time = 1780000000;
export const day = 86_400;

// The schema is pushed from src/api/db/schema once per test run, then copied
// for each test, so tests always run against the current schema.
const template = (async () => {
	const directory = await mkdtemp(join(tmpdir(), "payments-schema-"));
	const path = join(directory, "schema.db");
	const client = createClient({ url: `file:${path}` });
	try {
		const push = await pushSQLiteSchema(schema, drizzle({ client }));
		await push.apply();
	} finally {
		client.close();
	}
	return path;
})();

export const receipt = (
	id = "bank-1",
	amount = 19900,
	message = "Bills",
): BankTransaction =>
	bankTransactionSchema.parse({
		id,
		attributes: {
			status: "SETTLED",
			description: "Mr Oliver William Caprile",
			rawText: "OLIVER WILLIAM CAPRI",
			message,
			amount: { currencyCode: "AUD", valueInBaseUnits: amount },
			createdAt: new Date(time * 1000).toISOString(),
			settledAt: new Date(time * 1000).toISOString(),
		},
		relationships: {
			account: { data: { id: "spending" } },
			transferAccount: { data: null },
		},
	});

// Oliver and Sarah share the house with Jay, the owner, and one gas bill.
export async function fixture(
	run: (client: Client) => Promise<void>,
): Promise<void> {
	const directory = await mkdtemp(join(tmpdir(), "payments-test-"));
	const path = join(directory, "payments.db");
	await copyFile(await template, path);
	const client = createClient({ url: `file:${path}` });
	try {
		await client.execute(
			`INSERT INTO housemates(id,name,bank_alias,is_owner,is_active,created_at,updated_at) VALUES('oliver','Oliver Caprile','OLIVER WILLIAM CAPRIL',0,1,${time},${time}),('sarah','Sarah O Dwyer',NULL,0,1,${time},${time}),('jay','Jay McMullen',NULL,1,1,${time},${time})`,
		);
		await addBill(client, { id: "bill", name: "Gas", dueAt: time - 10 });
		await run(client);
	} finally {
		client.close();
		await rm(directory, { recursive: true, force: true });
	}
}

export async function addBill(
	client: Client,
	bill: {
		id: string;
		name: string;
		dueAt: number;
		billType?: string;
		stackGroup?: string;
		recurringBillId?: string;
	},
): Promise<void> {
	await client.execute({
		sql: "INSERT INTO bills(id,biller_name,total_cents,due_date,bill_type,stack_group,recurring_bill_id,created_at,updated_at) VALUES (?,?,0,?,?,?,?,?,?)",
		args: [
			bill.id,
			bill.name,
			bill.dueAt,
			bill.billType ?? null,
			bill.stackGroup ?? null,
			bill.recurringBillId ?? null,
			time - 1000,
			time - 1000,
		],
	});
}

// Bill shares as [debtId, housemateId, billId, amountCents].
export async function addShares(
	client: Client,
	shares: Array<[string, string, string, number]>,
): Promise<void> {
	for (const [id, housemateId, billId, amountCents] of shares)
		await client.execute({
			sql: "INSERT INTO debts(id,housemate_id,bill_id,amount_cents,created_at,updated_at) VALUES (?,?,?,?,?,?)",
			args: [id, housemateId, billId, amountCents, time, time],
		});
}

export async function ingest(client: Client, bank = receipt()): Promise<void> {
	await withWriteTransaction(client, (tx) => ingestBankTransaction(tx, bank));
}

export async function revision(client: Client, id: string): Promise<number> {
	return Number(
		(
			await client.execute({
				sql: "SELECT updated_at FROM bank_transactions WHERE id=?",
				args: [id],
			})
		).rows[0].updated_at,
	);
}

// Ingests the transfer if needed and confirms it for a housemate.
export async function confirm(
	client: Client,
	transactionId: string,
	housemateId: string,
	allocations: Array<{ debtId: string; amountCents: number }> = [],
	reason = "",
): Promise<void> {
	await decideBankTransaction(client, {
		transactionId,
		action: "confirm",
		housemateId,
		allocations,
		reason,
		expectedRevision: await revision(client, transactionId),
	});
}

// Records cash against the housemate's current account revision.
export async function recordCash(
	client: Client,
	cash: {
		housemateId: string;
		amountCents: number;
		receivedAt: number;
		note?: string;
		allocations: Array<{ debtId: string; amountCents: number }>;
	},
): Promise<{ receiptId: string }> {
	return recordCashReceipt(client, {
		...cash,
		expectedRevision: (await getAccountPayments(client, cash.housemateId))
			.revision,
	});
}

export async function count(client: Client, sql: string): Promise<number> {
	return Number((await client.execute(sql)).rows[0].n);
}
