import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { type Client, createClient } from "@libsql/client";
import {
	type BankTransaction,
	type LedgerSource,
	bankTransactionSchema,
	calculateStatement,
	currentStatement,
	identifyHousemate,
} from "../model";
import {
	applySource,
	drainLedgerEvents,
	getAccountStatement,
	ingestBankTransaction,
	reviewBankTransaction,
	withWriteTransaction,
} from "../store";
import { importUpHistory } from "../up-import";

const migration = await readFile(
	new URL("../../../db/migrations/0009_housemate_ledger.sql", import.meta.url),
	"utf8",
);
const time = 1780000000;
const receipt = (
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
const charge: LedgerSource = {
	housemateId: "oliver",
	kind: "charge",
	amountCents: 10000,
	description: "Gas",
	billId: "bill",
	effectiveAt: time - 100,
	dueAt: time - 10,
};

async function fixture(run: (client: Client) => Promise<void>): Promise<void> {
	const directory = await mkdtemp(join(tmpdir(), "ledger-test-"));
	const client = createClient({ url: `file:${join(directory, "ledger.db")}` });
	try {
		await client.executeMultiple(`CREATE TABLE housemates(id TEXT PRIMARY KEY,name TEXT,bank_alias TEXT,is_owner INTEGER,credit_balance REAL DEFAULT 0);
		CREATE TABLE bills(id TEXT PRIMARY KEY,biller_name TEXT,due_date INTEGER,created_at INTEGER);
		CREATE TABLE debts(id TEXT PRIMARY KEY,housemate_id TEXT,bill_id TEXT,amount_owed REAL,amount_paid REAL DEFAULT 0,created_at INTEGER);
		CREATE TABLE payment_transactions(id TEXT PRIMARY KEY,transaction_id TEXT UNIQUE,housemate_id TEXT,amount REAL,status TEXT,source TEXT,description TEXT,raw_data TEXT,settled_at INTEGER,up_created_at INTEGER,created_at INTEGER,matched_debt_ids TEXT);
		INSERT INTO housemates VALUES('oliver','Oliver Caprile','OLIVER WILLIAM CAPRIL',0,0),('sarah','Sarah O Dwyer',NULL,0,0),('jay','Jay McMullen',NULL,1,0);
		INSERT INTO bills VALUES('bill','Gas',${time - 10},${time - 1000});`);
		await client.executeMultiple(migration);
		await run(client);
	} finally {
		client.close();
		await rm(directory, { recursive: true, force: true });
	}
}

async function ingest(client: Client, bank = receipt()): Promise<void> {
	await withWriteTransaction(client, (tx) => ingestBankTransaction(tx, bank));
}

async function manual(client: Client, amount = 199): Promise<void> {
	await client.execute({
		sql: "INSERT INTO payment_transactions(id,transaction_id,housemate_id,amount,status,source,description,created_at) VALUES ('manual','manual-1','oliver',?,'matched','manual_admin','Manual payment',?)",
		args: [amount, time],
	});
	await drainLedgerEvents(client);
}

test("a non-matching payment immediately reduces the balance and excess remains credit; retries do not duplicate", async () =>
	fixture(async (client) => {
		await withWriteTransaction(client, (tx) =>
			applySource(tx, "charge:1", charge),
		);
		await ingest(client);
		await ingest(client);
		const statement = await getAccountStatement(client, "oliver");
		assert.equal(statement.balanceCents, -9900);
		assert.equal(statement.creditCents, 9900);
		assert.equal(statement.entries.length, 2);
		assert.deepEqual(
			statement.entries.map((entry) => entry.runningBalanceCents),
			[10000, -9900],
		);
	}));

test("only whole-word Bills or Rent references auto-credit; legacy matches do not bypass approval", async () =>
	fixture(async (client) => {
		for (const [index, message] of [
			"Gas",
			"Cleaners",
			"Pool",
			"Bill",
			"Rental",
			"",
			"bills",
			"RENT",
			"Rent clean",
		].entries())
			await ingest(client, receipt(`reference-${index}`, 3000, message));
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			-9000,
		);
		const legacy = receipt("old-match", 19900, "Gas");
		await client.execute({
			sql: "INSERT INTO payment_transactions(id,transaction_id,housemate_id,amount,status,source,description,raw_data,settled_at,created_at) VALUES ('p','old-match','oliver',199,'matched','up_bank','Gas',?,?,?)",
			args: [JSON.stringify(legacy), time, time],
		});
		await drainLedgerEvents(client);
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			-9000,
		);
		const revision = Number(
			(
				await client.execute(
					"SELECT updated_at FROM ledger_bank_transactions WHERE id='old-match'",
				)
			).rows[0].updated_at,
		);
		await reviewBankTransaction(client, {
			transactionId: "old-match",
			action: "credit",
			housemateId: "oliver",
			reason: "Jay confirmed this was gas",
			expectedRevision: revision,
		});
		await assert.rejects(
			reviewBankTransaction(client, {
				transactionId: "old-match",
				action: "exclude",
				reason: "Stale browser decision",
				expectedRevision: revision,
			}),
			/changed since/,
		);
		await ingest(client, legacy);
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			-28900,
		);
	}));

test("blank references and pre-history receipts stay visible for review", async () =>
	fixture(async (client) => {
		await ingest(client, receipt("blank", 77600, ""));
		const historical = receipt("old");
		historical.attributes.settledAt = new Date(
			(time - 10000) * 1000,
		).toISOString();
		await ingest(client, historical);
		assert.equal((await getAccountStatement(client, "oliver")).balanceCents, 0);
		assert.equal(
			(
				await client.execute(
					"SELECT count(*) AS n FROM ledger_bank_transactions WHERE decision='review'",
				)
			).rows[0].n,
			2,
		);
	}));

test("a manual entry arriving after a bank receipt flags a duplicate; linking counts the money once", async () =>
	fixture(async (client) => {
		await ingest(client);
		await manual(client);
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			-19900,
		);
		assert.equal(
			(await client.execute("SELECT decision FROM ledger_bank_transactions"))
				.rows[0].decision,
			"review",
		);
		await reviewBankTransaction(client, {
			transactionId: "bank-1",
			action: "link",
			housemateId: "oliver",
			manualSourceKey: "manual:manual-1",
			reason: "Same payment verified",
		});
		await ingest(client);
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			-19900,
		);
		await client.execute(
			"UPDATE payment_transactions SET amount=150 WHERE id='manual'",
		);
		await drainLedgerEvents(client);
		assert.equal(
			(await client.execute("SELECT decision FROM ledger_bank_transactions"))
				.rows[0].decision,
			"review",
		);
	}));

test("existing matched legacy payments and bank imports share the same source", async () =>
	fixture(async (client) => {
		const bank = receipt();
		await client.execute({
			sql: "INSERT INTO payment_transactions(id,transaction_id,housemate_id,amount,status,source,description,raw_data,settled_at,created_at) VALUES ('p','bank-1','oliver',199,'matched','up_bank','Gas',?,?,?)",
			args: [JSON.stringify(bank), time, time],
		});
		await drainLedgerEvents(client);
		await ingest(client, bank);
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			-19900,
		);
		assert.equal(
			(await getAccountStatement(client, "oliver")).entries.length,
			1,
		);
		await client.execute(
			"UPDATE payment_transactions SET housemate_id='sarah' WHERE id='p'",
		);
		await drainLedgerEvents(client);
		assert.equal((await getAccountStatement(client, "oliver")).balanceCents, 0);
		assert.equal(
			(await getAccountStatement(client, "sarah")).balanceCents,
			-19900,
		);
	}));

test("a deleted bank transaction cannot be recredited from its stored receipt", async () =>
	fixture(async (client) => {
		await ingest(client, receipt("deleted", 3000, ""));
		await client.execute(
			"UPDATE ledger_bank_transactions SET bank_status='DELETED' WHERE id='deleted'",
		);
		await assert.rejects(
			reviewBankTransaction(client, {
				transactionId: "deleted",
				action: "credit",
				housemateId: "oliver",
				reason: "Must reject deleted receipt",
			}),
			/Deleted bank/,
		);
		assert.equal((await getAccountStatement(client, "oliver")).balanceCents, 0);
	}));

test("legacy charge edits and deletion create immutable corrections, retaining money received", async () =>
	fixture(async (client) => {
		await client.execute(
			`INSERT INTO debts VALUES('d','oliver','bill',100,0,${time - 100})`,
		);
		await drainLedgerEvents(client);
		await ingest(client);
		await client.execute("UPDATE debts SET amount_owed=120 WHERE id='d'");
		await drainLedgerEvents(client);
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			-7900,
		);
		const visible = currentStatement(
			await getAccountStatement(client, "oliver"),
			time + 1000,
		);
		assert.equal(visible.balanceCents, -7900);
		assert.equal(visible.entries.length, 2);
		await client.execute("DELETE FROM debts WHERE id='d'");
		await drainLedgerEvents(client);
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			-19900,
		);
		await assert.rejects(
			client.execute("DELETE FROM ledger_entries"),
			/immutable/,
		);
		await assert.rejects(
			client.execute("UPDATE ledger_entries SET amount_cents=1"),
			/immutable/,
		);
	}));

test("review decisions are idempotent, reassignable and retained on reimport", async () =>
	fixture(async (client) => {
		await ingest(client, receipt("bank-1", 2000, ""));
		const decision = {
			transactionId: "bank-1",
			action: "credit" as const,
			housemateId: "oliver",
			reason: "Confirmed household payment",
		};
		await reviewBankTransaction(client, decision);
		await reviewBankTransaction(client, decision);
		assert.equal(
			(await getAccountStatement(client, "oliver")).entries.length,
			1,
		);
		await reviewBankTransaction(client, { ...decision, housemateId: "sarah" });
		assert.equal((await getAccountStatement(client, "oliver")).balanceCents, 0);
		assert.equal(
			(await getAccountStatement(client, "sarah")).balanceCents,
			-2000,
		);
		await ingest(client, receipt("bank-1", 2000, ""));
		assert.equal(
			(await getAccountStatement(client, "sarah")).balanceCents,
			-2000,
		);
		await reviewBankTransaction(client, {
			transactionId: "bank-1",
			action: "exclude",
			reason: "Previously accounted rent",
		});
		assert.equal((await getAccountStatement(client, "sarah")).balanceCents, 0);
	}));

test("pending and foreign-currency receipts never credit AUD balances", async () =>
	fixture(async (client) => {
		const pending = receipt();
		pending.attributes.status = "HELD";
		pending.attributes.settledAt = null;
		await ingest(client, pending);
		await assert.rejects(
			reviewBankTransaction(client, {
				transactionId: "bank-1",
				action: "credit",
				housemateId: "oliver",
				reason: "Invalid pending receipt",
			}),
			/settled/,
		);
		const foreign = receipt("foreign");
		foreign.attributes.amount.currencyCode = "USD";
		await ingest(client, foreign);
		assert.equal((await getAccountStatement(client, "oliver")).balanceCents, 0);
		await ingest(client);
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			-19900,
		);
	}));

test("refunds increase the balance and a failed transaction rolls back both decision and posting", async () =>
	fixture(async (client) => {
		await ingest(client, receipt("refund", -5000, "Refund"));
		await reviewBankTransaction(client, {
			transactionId: "refund",
			action: "credit",
			housemateId: "oliver",
			reason: "Refund returned to housemate",
		});
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			5000,
		);
		await assert.rejects(
			withWriteTransaction(client, async (tx) => {
				await applySource(tx, "test", charge);
				throw new Error("rollback");
			}),
			/rollback/,
		);
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			5000,
		);
	}));

test("due now and upcoming use account credit without exact invoice matching", () => {
	const entries = [
		{
			...charge,
			id: "1",
			sourceKey: "charge:1",
			recordedAt: time,
			reversesEntryId: null,
		},
		{
			...charge,
			id: "2",
			sourceKey: "charge:2",
			dueAt: time + 86400,
			recordedAt: time,
			reversesEntryId: null,
		},
		{
			...charge,
			id: "3",
			sourceKey: "bank:1",
			kind: "payment" as const,
			amountCents: -15000,
			dueAt: null,
			recordedAt: time,
			reversesEntryId: null,
		},
	];
	const statement = calculateStatement(entries, time);
	assert.equal(statement.balanceCents, 5000);
	assert.equal(statement.dueNowCents, 0);
	assert.equal(statement.upcomingCents, 5000);
});

test("explicit beneficiary takes precedence and middle names do not hide Oliver", () => {
	const housemates = [
		{ id: "oliver", name: "Oliver Caprile", bankAlias: null, isOwner: false },
		{ id: "sarah", name: "Sarah O Dwyer", bankAlias: null, isOwner: false },
	];
	assert.equal(identifyHousemate(receipt(), housemates)?.id, "oliver");
	const forwarded = receipt();
	forwarded.attributes.description = "Sarah O Dwyer";
	forwarded.attributes.rawText = null;
	forwarded.attributes.message = "Bills for Oliver";
	assert.equal(identifyHousemate(forwarded, housemates)?.id, "oliver");
});

test("Up import follows every page and safely reruns without posting duplicates", async () =>
	fixture(async (client) => {
		const original = globalThis.fetch;
		let requests = 0;
		globalThis.fetch = async (
			input: string | URL | Request,
		): Promise<Response> => {
			requests += 1;
			const second = String(input).includes("cursor=next");
			return Response.json({
				data: [receipt(second ? "second" : "first")],
				links: {
					next: second
						? null
						: "https://api.up.com.au/api/v1/transactions?cursor=next",
				},
			});
		};
		try {
			assert.deepEqual(await importUpHistory(client, "test-token"), {
				pages: 2,
				transactions: 2,
				complete: true,
			});
			await importUpHistory(client, "test-token");
			assert.equal(requests, 4);
			assert.equal(
				(await getAccountStatement(client, "oliver")).balanceCents,
				-39800,
			);
			assert.equal(
				(await getAccountStatement(client, "oliver")).entries.length,
				2,
			);
		} finally {
			globalThis.fetch = original;
		}
	}));
