import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { type Client, createClient } from "@libsql/client";
import { getAccountPayments } from "../account-payments";
import { allocateReceipt, recordReceipt } from "../allocation-actions";
import { ingestBankTransaction } from "../bank-ingest";
import { getBillVerification } from "../bill-verification";
import { drainLedgerEvents } from "../events";
import { type BankTransaction, bankTransactionSchema } from "../model";
import { withWriteTransaction } from "../sources";

const time = 1780000000;
const migrations = [
	"0009_housemate_ledger",
	"0011_payment_review_simplification",
	"0013_payment_bill_allocations",
	"0014_allocation_review_decisions",
	"0015_review_group",
];

const receipt = (id: string, amount: number): BankTransaction =>
	bankTransactionSchema.parse({
		id,
		attributes: {
			status: "SETTLED",
			description: "Mr Oliver William Caprile",
			rawText: "OLIVER WILLIAM CAPRI",
			message: "Bills",
			amount: { currencyCode: "AUD", valueInBaseUnits: amount },
			createdAt: new Date(time * 1000).toISOString(),
			settledAt: new Date(time * 1000).toISOString(),
		},
		relationships: {
			account: { data: { id: "spending" } },
			transferAccount: { data: null },
		},
	});

async function fixture(run: (client: Client) => Promise<void>): Promise<void> {
	const directory = await mkdtemp(join(tmpdir(), "bill-verification-"));
	const client = createClient({ url: `file:${join(directory, "ledger.db")}` });
	try {
		await client.executeMultiple(`CREATE TABLE housemates(id TEXT PRIMARY KEY,name TEXT,bank_alias TEXT,is_owner INTEGER,credit_balance REAL DEFAULT 0);
		CREATE TABLE bills(id TEXT PRIMARY KEY,biller_name TEXT,due_date INTEGER,created_at INTEGER,bill_type TEXT,stack_group TEXT);
		CREATE TABLE debts(id TEXT PRIMARY KEY,housemate_id TEXT,bill_id TEXT,amount_owed REAL,amount_paid REAL DEFAULT 0,created_at INTEGER);
		CREATE TABLE payment_transactions(id TEXT PRIMARY KEY,transaction_id TEXT UNIQUE,housemate_id TEXT,amount REAL,status TEXT,source TEXT,description TEXT,raw_data TEXT,settled_at INTEGER,up_created_at INTEGER,created_at INTEGER,matched_debt_ids TEXT,credit_amount REAL DEFAULT 0);
		INSERT INTO housemates VALUES('oliver','Oliver Caprile','OLIVER WILLIAM CAPRIL',0,0),('sarah','Sarah O Dwyer',NULL,0,0),('jay','Jay McMullen',NULL,1,0);`);
		for (const name of migrations)
			await client.executeMultiple(
				await readFile(
					new URL(`../../../db/migrations/${name}.sql`, import.meta.url),
					"utf8",
				),
			);
		await drainLedgerEvents(client);
		await run(client);
	} finally {
		client.close();
		await rm(directory, { recursive: true, force: true });
	}
}

test("reports unavailable when ledger tables are missing", async () => {
	const client = createClient({ url: ":memory:" });
	try {
		assert.deepEqual(await getBillVerification(client), { available: false });
	} finally {
		client.close();
	}
});

test("pivots housemate payments into bills with shares, receipts, status and summary", async () =>
	fixture(async (client) => {
		await client.executeMultiple(`
			INSERT INTO bills VALUES('gas','AGL Gas',${time - 10},${time - 1000},'gas',NULL),('clean','Cleaners',${time + 100},${time - 500},NULL,'cleaning');
			INSERT INTO debts VALUES('gas-o','oliver','gas',100,100,${time - 100}),('gas-s','sarah','gas',50,50,${time - 100}),('clean-o','oliver','clean',30,0,${time - 50});`);
		await drainLedgerEvents(client);

		await withWriteTransaction(client, (tx) =>
			ingestBankTransaction(tx, receipt("bank-1", 10000)),
		);
		const oliver = await getAccountPayments(client, "oliver");
		await allocateReceipt(client, {
			housemateId: "oliver",
			receiptId: "bank:bank-1",
			allocations: [{ debtId: "gas-o", amountCents: 10000 }],
			expectedRevision: oliver.revision,
		});

		const sarahBefore = await getAccountPayments(client, "sarah");
		await recordReceipt(client, {
			housemateId: "sarah",
			amountCents: 2000,
			receivedAt: time - 5,
			description: "Cash from Sarah",
			expectedRevision: sarahBefore.revision,
		});
		const sarah = await getAccountPayments(client, "sarah");
		await allocateReceipt(client, {
			housemateId: "sarah",
			receiptId: sarah.receipts[0].id,
			allocations: [{ debtId: "gas-s", amountCents: 2000 }],
			expectedRevision: sarah.revision,
		});

		const result = await getBillVerification(client);
		assert.ok(result.available);
		assert.deepEqual(
			result.bills.map((bill) => [bill.id, bill.status]),
			[
				["clean", "unpaid"],
				["gas", "check"],
			],
		);
		const gas = result.bills[1];
		assert.equal(gas.name, "AGL Gas");
		assert.equal(gas.category, "gas");
		assert.equal(gas.dueAt, time - 10);
		assert.equal(gas.amountCents, 15000);
		assert.equal(gas.paidCents, 12000);
		assert.equal(gas.remainingCents, 3000);

		const [oliverShare, sarahShare] = gas.shares;
		assert.equal(oliverShare.housemateName, "Oliver Caprile");
		assert.equal(oliverShare.paidCents, 10000);
		assert.equal(oliverShare.remainingCents, 0);
		assert.equal(oliverShare.legacyPaidCents, 10000);
		assert.equal(oliverShare.mismatch, false);
		assert.equal(oliverShare.receipts.length, 1);
		assert.equal(oliverShare.receipts[0].receiptId, "bank:bank-1");
		assert.equal(oliverShare.receipts[0].amountCents, 10000);
		assert.equal(oliverShare.receipts[0].bankMatched, true);
		assert.equal(oliverShare.receipts[0].manual, false);

		assert.equal(sarahShare.housemateName, "Sarah O Dwyer");
		assert.equal(sarahShare.paidCents, 2000);
		assert.equal(sarahShare.remainingCents, 3000);
		assert.equal(sarahShare.legacyPaidCents, 5000);
		assert.equal(sarahShare.mismatch, true);
		assert.equal(sarahShare.receipts.length, 1);
		assert.equal(sarahShare.receipts[0].description, "Cash from Sarah");
		assert.equal(sarahShare.receipts[0].amountCents, 2000);
		assert.equal(sarahShare.receipts[0].bankMatched, false);
		assert.equal(sarahShare.receipts[0].manual, true);
		assert.equal(sarahShare.receipts[0].receivedDateKnown, true);

		const clean = result.bills[0];
		assert.equal(clean.category, "cleaning");
		assert.equal(clean.shares.length, 1);
		assert.equal(clean.shares[0].receipts.length, 0);
		assert.equal(clean.shares[0].mismatch, false);

		assert.deepEqual(result.summary, {
			paid: 0,
			part: 0,
			unpaid: 1,
			check: 1,
			remainingCents: 6000,
		});
	}));

test("a bill whose shares are all covered is paid and a partly covered bill is part", async () =>
	fixture(async (client) => {
		await client.executeMultiple(`
			INSERT INTO bills VALUES('water','Water',${time},${time - 1000},'water',NULL);
			INSERT INTO debts VALUES('water-o','oliver','water',40,40,${time - 100}),('water-s','sarah','water',40,0,${time - 100});`);
		await drainLedgerEvents(client);
		await withWriteTransaction(client, (tx) =>
			ingestBankTransaction(tx, receipt("bank-2", 4000)),
		);
		const oliver = await getAccountPayments(client, "oliver");
		await allocateReceipt(client, {
			housemateId: "oliver",
			receiptId: "bank:bank-2",
			allocations: [{ debtId: "water-o", amountCents: 4000 }],
			expectedRevision: oliver.revision,
		});
		const part = await getBillVerification(client);
		assert.ok(part.available);
		assert.equal(part.bills[0].status, "part");

		const sarahBefore = await getAccountPayments(client, "sarah");
		await recordReceipt(client, {
			housemateId: "sarah",
			amountCents: 4000,
			receivedAt: time - 5,
			description: "Sarah transfer",
			expectedRevision: sarahBefore.revision,
		});
		const sarah = await getAccountPayments(client, "sarah");
		await allocateReceipt(client, {
			housemateId: "sarah",
			receiptId: sarah.receipts[0].id,
			allocations: [{ debtId: "water-s", amountCents: 4000 }],
			expectedRevision: sarah.revision,
		});
		await client.execute("UPDATE debts SET amount_paid=40 WHERE id='water-s'");
		const paid = await getBillVerification(client);
		assert.ok(paid.available);
		assert.equal(paid.bills[0].status, "paid");
		assert.equal(paid.summary.paid, 1);
		assert.equal(paid.summary.remainingCents, 0);
	}));
