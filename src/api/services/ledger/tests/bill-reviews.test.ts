import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { type Client, createClient } from "@libsql/client";
import { getAccountPayments } from "../account-payments";
import { allocateReceipt } from "../allocation-actions";
import { restoreLegacyAllocations } from "../bill-allocations";
import { approveBill } from "../bill-reviews";
import { loadBillVerification } from "../bill-verification";
import { drainLedgerEvents } from "../events";
import { withWriteTransaction } from "../sources";
import { legacyTables } from "./legacy-tables";

const time = 1780000000;
const before = [
	"0009_housemate_ledger",
	"0011_payment_review_simplification",
	"0013_payment_bill_allocations",
	"0014_allocation_review_decisions",
	"0015_review_group",
];

async function apply(client: Client, name: string): Promise<void> {
	await client.executeMultiple(
		await readFile(
			new URL(`../../../db/migrations/${name}.sql`, import.meta.url),
			"utf8",
		),
	);
}

// Recreates the live database as it stood before the freeze: history up to
// 0015 applied and its allocation backfills already processed.
async function fixture(run: (client: Client) => Promise<void>): Promise<void> {
	const directory = await mkdtemp(join(tmpdir(), "bill-reviews-"));
	const client = createClient({ url: `file:${join(directory, "ledger.db")}` });
	try {
		await client.executeMultiple(`${legacyTables}
		INSERT INTO housemates VALUES('oliver','Oliver Caprile','OLIVER WILLIAM CAPRIL',0),('sarah','Sarah O Dwyer',NULL,0),('jay','Jay McMullen',NULL,1);
		INSERT INTO bills(id,biller_name,due_date,created_at,bill_type) VALUES('gas','Gas',${time - 10},${time - 1000},'gas'),('water','Water',${time},${time - 1000},'water'),('power','Power',${time + 10},${time - 1000},'power');
		INSERT INTO debts(id,housemate_id,bill_id,amount_owed,amount_paid,created_at) VALUES('gas-o','oliver','gas',60,60,${time}),('water-o','oliver','water',40,0,${time}),('water-s','sarah','water',40,0,${time}),('power-o','oliver','power',25,0,${time});
		INSERT INTO payment_transactions(id,transaction_id,housemate_id,amount,status,source,description,created_at,matched_debt_ids) VALUES('m-gas','m-gas','oliver',60,'matched','manual_admin','Manual gas',${time + 100},'["gas-o"]');`);
		for (const name of before) await apply(client, name);
		await client.execute(
			"UPDATE ledger_events SET processed_at=unixepoch() WHERE kind='allocations'",
		);
		await drainLedgerEvents(client);
		await run(client);
	} finally {
		client.close();
		await rm(directory, { recursive: true, force: true });
	}
}

const rows = async (client: Client, sql: string) =>
	(await client.execute(sql)).rows;

test("migration 0017 releases auto allocations, freezes legacy ones and pre-ticks covered bills", async () =>
	fixture(async (client) => {
		await client.executeMultiple(`
			INSERT INTO ledger_sources(source_key,entry_id,snapshot) VALUES('bank:auto','e-auto','{"housemateId":"oliver","amountCents":-4000,"kind":"payment","description":"Bills","billId":null,"effectiveAt":${time},"dueAt":null}');
			INSERT INTO ledger_entries(id,housemate_id,source_key,kind,amount_cents,description,bill_id,effective_at,due_at,recorded_at) VALUES('e-auto','oliver','bank:auto','payment',-4000,'Bills',NULL,${time},NULL,${time});
			INSERT INTO ledger_bill_allocations(source_key,debt_id,amount_cents,origin) VALUES('bank:auto','water-o',4000,'auto');
			INSERT INTO ledger_allocation_history(source_key,debt_id,amount_cents,origin) VALUES('bank:auto','water-o',4000,'auto');
			UPDATE debts SET amount_paid=40,is_paid=1,paid_at=${time} WHERE id='water-o';
			UPDATE bills SET status='partially_paid' WHERE id='water';`);
		assert.deepEqual(
			(
				await rows(
					client,
					"SELECT source_key,debt_id,origin FROM ledger_bill_allocations ORDER BY source_key",
				)
			).map((row) => [row.source_key, row.debt_id, row.origin]),
			[
				["bank:auto", "water-o", "auto"],
				["manual:m-gas", "gas-o", "legacy"],
			],
		);

		await apply(client, "0017_freeze_history");
		assert.deepEqual(
			(
				await rows(
					client,
					"SELECT source_key,debt_id,origin FROM ledger_bill_allocations",
				)
			).map((row) => [row.source_key, row.debt_id, row.origin]),
			[["manual:m-gas", "gas-o", "legacy"]],
		);
		assert.deepEqual(
			(
				await rows(
					client,
					"SELECT source_key,amount_cents,origin FROM ledger_allocation_history WHERE source_key='bank:auto' ORDER BY id",
				)
			).map((row) => [row.source_key, Number(row.amount_cents), row.origin]),
			[
				["bank:auto", 4000, "auto"],
				["bank:auto", -4000, "released"],
			],
		);
		assert.deepEqual(
			(
				await rows(
					client,
					"SELECT source_key FROM ledger_allocation_reviews ORDER BY source_key",
				)
			).map((row) => row.source_key),
			["manual:m-gas"],
		);
		assert.deepEqual(
			(await rows(client, "SELECT bill_id FROM ledger_bill_reviews")).map(
				(row) => row.bill_id,
			),
			["gas"],
		);
		assert.equal(
			(
				await rows(
					client,
					"SELECT kind FROM ledger_events WHERE processed_at IS NULL",
				)
			)[0]?.kind,
			"paid_state",
		);

		assert.equal(await drainLedgerEvents(client), 1);
		const water = (
			await rows(
				client,
				"SELECT amount_paid,is_paid,paid_at FROM debts WHERE id='water-o'",
			)
		)[0];
		assert.equal(water.amount_paid, 0);
		assert.equal(water.is_paid, 0);
		assert.equal(water.paid_at, null);
		assert.equal(
			(await rows(client, "SELECT status FROM bills WHERE id='water'"))[0]
				.status,
			"pending",
		);
		assert.equal(
			(await rows(client, "SELECT is_paid FROM debts WHERE id='gas-o'"))[0]
				.is_paid,
			1,
		);

		const oliver = await getAccountPayments(client, "oliver");
		await allocateReceipt(client, {
			housemateId: "oliver",
			receiptId: "manual:m-gas",
			allocations: [],
			expectedRevision: oliver.revision,
		});
		await withWriteTransaction(client, (tx) => restoreLegacyAllocations(tx));
		assert.deepEqual(
			await rows(
				client,
				"SELECT source_key FROM ledger_bill_allocations WHERE source_key='manual:m-gas'",
			),
			[],
		);
	}));

test("bills report approval from reviews and approveBill toggles the row", async () =>
	fixture(async (client) => {
		await apply(client, "0017_freeze_history");
		await drainLedgerEvents(client);
		const initial = await loadBillVerification(client);
		assert.ok(initial.available);
		assert.deepEqual(
			initial.bills.map((bill) => [bill.id, bill.approved, bill.needsLook]),
			[
				["power", false, true],
				["water", false, true],
				["gas", true, false],
			],
		);
		assert.equal(initial.summary.approved, 1);
		assert.equal(initial.summary.needsLook, 2);

		await approveBill(client, "water", true);
		await approveBill(client, "water", true);
		const approved = await loadBillVerification(client);
		assert.ok(approved.available);
		assert.equal(
			approved.bills.find((bill) => bill.id === "water")?.approved,
			true,
		);
		assert.equal(approved.summary.approved, 2);

		await approveBill(client, "water", false);
		await approveBill(client, "gas", false);
		const cleared = await loadBillVerification(client);
		assert.ok(cleared.available);
		assert.equal(cleared.summary.approved, 0);
		assert.equal(cleared.summary.needsLook, 3);
		assert.deepEqual(
			await rows(client, "SELECT * FROM ledger_bill_reviews"),
			[],
		);
	}));
