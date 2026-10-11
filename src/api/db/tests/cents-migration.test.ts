import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { loadAccount } from "../../services/account/account.server";
import { legacyTables } from "../../services/ledger/tests/legacy-tables";

const read = (name: string) =>
	readFile(new URL(`../migrations/${name}.sql`, import.meta.url), "utf8");

test("0022 converts money to cents, drops cached paid state and rebuilds the debts triggers", async () => {
	const directory = await mkdtemp(join(tmpdir(), "migration-0022-"));
	const client = createClient({ url: `file:${join(directory, "app.db")}` });
	try {
		await client.executeMultiple(`${legacyTables}
			INSERT INTO housemates VALUES('oliver','Oliver',NULL,0);
			INSERT INTO bills(id,biller_name,total_amount,due_date,created_at,status) VALUES('gas','Gas',100.1,100,50,'paid');
			INSERT INTO recurringBills(id,templateName,billerName,totalAmount) VALUES('rent','Rent','Agent',1865.75);
			INSERT INTO recurringBillAssignments(id,customAmount) VALUES('a',372.15),('b',NULL);`);
		for (const name of [
			"0009_housemate_ledger",
			"0011_payment_review_simplification",
			"0013_payment_bill_allocations",
			"0014_allocation_review_decisions",
			"0015_review_group",
			"0017_freeze_history",
			"0021_drop_legacy_payments",
		])
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
		const account = await loadAccount("oliver", { client, now: 1000 });
		const paid = account?.shares.find((share) => share.id === "paid");
		assert.equal(paid?.remainingCents, 0);
		assert.equal(paid?.settledAt, 80);
		const unpaid = account?.shares.find((share) => share.id === "d");
		assert.equal(unpaid?.paidCents, 0);
		assert.deepEqual(
			account?.receipts.map((receipt) => [
				receipt.id,
				receipt.amountCents,
				receipt.receivedAt,
				receipt.cash,
				receipt.allocations,
			]),
			[
				[
					"manual:cash-migrated-paid",
					5000,
					80,
					true,
					[{ debtId: "paid", amountCents: 5000 }],
				],
			],
		);
		assert.equal(account?.creditCents, 0);
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
