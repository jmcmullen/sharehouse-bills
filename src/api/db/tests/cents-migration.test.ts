import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { loadAccounts } from "../../services/account/account.server";
import {
	ledgerMigrations,
	legacyTables,
	readMigration as read,
} from "./legacy-tables";

test("0022 converts money to cents, drops cached paid state and rebuilds the debts triggers", async () => {
	const directory = await mkdtemp(join(tmpdir(), "migration-0022-"));
	const client = createClient({ url: `file:${join(directory, "app.db")}` });
	try {
		await client.executeMultiple(`${legacyTables}
			INSERT INTO housemates VALUES('oliver','Oliver',NULL,0);
			INSERT INTO bills(id,biller_name,total_amount,due_date,created_at,status) VALUES('gas','Gas',100.1,100,50,'paid');
			INSERT INTO recurringBills(id,templateName,billerName,totalAmount) VALUES('rent','Rent','Agent',1865.75);
			INSERT INTO recurringBillAssignments(id,customAmount) VALUES('a',372.15),('b',NULL);`);
		for (const name of ledgerMigrations.slice(0, -1))
			await client.executeMultiple(await read(name));
		await client.execute(
			"INSERT INTO debts(id,housemate_id,bill_id,amount_owed,amount_paid,is_paid,paid_at,created_at,updated_at) VALUES('d','oliver','gas',33.37,0,0,NULL,60,60),('paid','oliver','gas',50,50,1,80,60,85)",
		);
		await client.executeMultiple(await read("0022_cents"));

		const columns = async (table: string) =>
			(await client.execute(`PRAGMA table_info(${table})`)).rows.map((row) =>
				String(row.name),
			);
		assert.deepEqual(await columns("debts"), [
			"id",
			"housemate_id",
			"bill_id",
			"created_at",
			"updated_at",
			"amount_cents",
		]);
		assert.ok(!(await columns("bills")).includes("status"));
		assert.ok(!(await columns("bills")).includes("total_amount"));
		const one = async (sql: string) => (await client.execute(sql)).rows[0];
		assert.equal(
			Number((await one("SELECT total_cents FROM bills")).total_cents),
			10010,
		);
		assert.equal(
			Number((await one("SELECT amount_cents FROM debts")).amount_cents),
			3337,
		);
		assert.equal(
			Number((await one("SELECT totalCents FROM recurringBills")).totalCents),
			186575,
		);
		assert.deepEqual(
			(
				await client.execute(
					"SELECT customCents FROM recurringBillAssignments ORDER BY id",
				)
			).rows.map((row) => row.customCents),
			[37215, null],
		);

		// A share paid before the ledger keeps its paid state as a migrated cash
		// receipt; a share with nothing paid is left alone.
		assert.deepEqual(
			(
				await client.execute(
					"SELECT s.source_key,e.amount_cents,e.effective_at,a.debt_id,a.amount_cents AS allocated FROM ledger_sources s JOIN ledger_entries e ON e.id=s.entry_id JOIN ledger_bill_allocations a ON a.source_key=s.source_key",
				)
			).rows.map((row) => [
				row.source_key,
				Number(row.amount_cents),
				Number(row.effective_at),
				row.debt_id,
				Number(row.allocated),
			]),
			[["manual:cash-migrated-paid", -5000, 80, "paid", 5000]],
		);
		assert.deepEqual(
			(
				await client.execute(
					"SELECT source_key,debt_id,amount_cents,origin FROM ledger_allocation_history",
				)
			).rows.map((row) => [
				row.source_key,
				row.debt_id,
				Number(row.amount_cents),
				row.origin,
			]),
			[["manual:cash-migrated-paid", "paid", 5000, "review"]],
		);
		assert.equal(
			Number(
				(
					await client.execute(
						"SELECT count(*) AS n FROM ledger_allocation_reviews WHERE source_key='manual:cash-migrated-paid'",
					)
				).rows[0].n,
			),
			1,
		);

		const pending = async () =>
			(
				await client.execute(
					"SELECT kind,payload FROM ledger_events WHERE processed_at IS NULL ORDER BY id",
				)
			).rows.map((row) => [row.kind, JSON.parse(String(row.payload))]);
		const queued = await pending();
		assert.deepEqual(
			queued.map(([kind]) => kind),
			["charge", "charge"],
			"paid_state is retired, the queued charges stay",
		);
		assert.deepEqual(
			queued.map(([, payload]) => [
				payload.id,
				payload.amountCents,
				payload.amount,
			]),
			[
				["d", 3337, undefined],
				["paid", 5000, undefined],
			],
		);

		await client.execute("UPDATE ledger_events SET processed_at=1");
		await client.executeMultiple(`
			INSERT INTO debts(id,housemate_id,bill_id,amount_cents,created_at) VALUES('e','oliver','gas',2500,70);
			UPDATE debts SET amount_cents=2600 WHERE id='e';
			UPDATE bills SET biller_name='Gas bill' WHERE id='gas';
			DELETE FROM debts WHERE id='e';`);
		assert.deepEqual(
			(await pending()).map(([, payload]) => [
				payload.id,
				payload.amountCents,
				payload.description,
			]),
			[
				["e", 2500, "Gas"],
				["e", 2600, "Gas"],
				["d", 3337, "Gas bill"],
				["paid", 5000, "Gas bill"],
				["e", 2600, "Gas bill"],
				["e", 0, "Gas bill"],
			],
		);
	} finally {
		client.close();
		await rm(directory, { recursive: true, force: true });
	}
});

// A live journal posting for a legacy payment no allocation claimed.
function legacyPayment(
	key: string,
	housemateId: string,
	cents: number,
	at: number,
) {
	return `INSERT INTO ledger_sources(source_key,entry_id,snapshot) VALUES('${key}','e-${key}','{}');
		INSERT INTO ledger_entries(id,housemate_id,source_key,kind,amount_cents,description,bill_id,effective_at,due_at,recorded_at,reverses_entry_id) VALUES('e-${key}','${housemateId}','${key}','payment',${-cents},'Legacy bills payment',NULL,${at},NULL,${at},NULL);`;
}

test("0022 places a housemate's unallocated legacy payments on shares paid before the ledger before minting money", async () => {
	const directory = await mkdtemp(join(tmpdir(), "migration-0022-credit-"));
	const client = createClient({ url: `file:${join(directory, "app.db")}` });
	const t = 1780000000;
	try {
		await client.executeMultiple(`${legacyTables}
			INSERT INTO housemates VALUES('oliver','Oliver',NULL,0),('mia','Mia',NULL,0),('sarah','Sarah',NULL,0),('jay','Jay',NULL,1);
			INSERT INTO bills(id,biller_name,total_amount,due_date,created_at,updated_at) VALUES('gas','Gas',100,${t},${t - 1000},${t - 1000}),('water','Water',30,${t},${t - 1000},${t - 1000});`);
		for (const name of ledgerMigrations.slice(0, -1))
			await client.executeMultiple(await read(name));
		await client.executeMultiple(`
			INSERT INTO debts(id,housemate_id,bill_id,amount_owed,amount_paid,is_paid,paid_at,created_at,updated_at) VALUES
				('gas-o','oliver','gas',60,60,1,${t},${t - 900},${t - 900}),
				('water-o','oliver','water',30,30,1,${t + 10},${t - 900},${t - 900}),
				('gas-m','mia','gas',40,40,1,${t},${t - 900},${t - 900}),
				('water-s','sarah','water',50,50,1,${t},${t - 900},${t - 900}),
				('gas-j','jay','gas',10,10,1,${t},${t - 900},${t - 900});
			UPDATE ledger_events SET processed_at=${t};
			${legacyPayment("manual:legacy-o", "oliver", 9000, t)}
			${legacyPayment("manual:legacy-s", "sarah", 2000, t)}`);
		await client.executeMultiple(await read("0022_cents"));

		const rows = async (sql: string) =>
			(await client.execute(sql)).rows.map((row) =>
				Object.values(row).map((value) =>
					typeof value === "bigint" ? Number(value) : value,
				),
			);
		// Oliver's $90 pays both his shares; Sarah's $20 goes first and the
		// rest is minted; Mia had no credit; the owner's share is left alone.
		assert.deepEqual(
			await rows(
				"SELECT source_key,debt_id,amount_cents,origin FROM ledger_bill_allocations ORDER BY source_key,debt_id",
			),
			[
				["manual:cash-migrated-gas-m", "gas-m", 4000, "review"],
				["manual:cash-migrated-water-s", "water-s", 3000, "review"],
				["manual:legacy-o", "gas-o", 6000, "review"],
				["manual:legacy-o", "water-o", 3000, "review"],
				["manual:legacy-s", "water-s", 2000, "review"],
			],
		);
		assert.deepEqual(
			await rows(
				"SELECT source_key,debt_id,amount_cents FROM ledger_allocation_history ORDER BY source_key,debt_id",
			),
			await rows(
				"SELECT source_key,debt_id,amount_cents FROM ledger_bill_allocations ORDER BY source_key,debt_id",
			),
		);
		assert.deepEqual(
			await rows(
				"SELECT source_key FROM ledger_allocation_reviews ORDER BY source_key",
			),
			[
				["manual:cash-migrated-gas-m"],
				["manual:cash-migrated-water-s"],
				["manual:legacy-o"],
				["manual:legacy-s"],
			],
		);
		assert.deepEqual(
			await rows(
				"SELECT housemate_id,amount_cents FROM ledger_entries WHERE source_key LIKE 'manual:cash-migrated-%' ORDER BY housemate_id",
			),
			[
				["mia", -4000],
				["sarah", -3000],
			],
		);

		await client.executeMultiple(await read("0023_receipts"));
		const accounts = await loadAccounts({ client, now: t });
		const oliver = accounts.find(
			(account) => account.housemate.id === "oliver",
		);
		assert.deepEqual(
			[oliver?.creditCents, oliver?.balanceCents, oliver?.owesCents],
			[0, 0, 0],
		);
		assert.deepEqual(
			oliver?.shares.map((share) => [share.id, share.remainingCents]),
			[
				["gas-o", 0],
				["water-o", 0],
			],
		);
	} finally {
		client.close();
		await rm(directory, { recursive: true, force: true });
	}
});
