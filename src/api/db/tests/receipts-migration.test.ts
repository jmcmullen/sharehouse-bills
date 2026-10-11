import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { type Client, createClient } from "@libsql/client";
import { seedLegacyLedger, seedTime as t } from "./legacy-ledger-seed";
import { readMigration } from "./legacy-tables";

const script = new URL(
	"../../scripts/verify-receipts-migration.ts",
	import.meta.url,
).pathname;

function verify(path: string, mode: "snapshot" | "check", file: string) {
	return spawnSync("bun", ["run", script, mode, file], {
		env: { ...process.env, DATABASE_URL: `file:${path}` },
		encoding: "utf8",
	});
}

async function withLegacyDatabase(
	run: (client: Client, path: string, directory: string) => Promise<void>,
): Promise<void> {
	const directory = await mkdtemp(join(tmpdir(), "migration-0023-"));
	const path = join(directory, "app.db");
	const client = createClient({ url: `file:${path}` });
	try {
		await seedLegacyLedger(client);
		await run(client, path, directory);
	} finally {
		client.close();
		await rm(directory, { recursive: true, force: true });
	}
}

const rows = async (client: Client, sql: string) =>
	(await client.execute(sql)).rows.map((row) => Object.values(row));

test("0023 moves the journal into receipts and allocations and the verification script finds no difference", async () =>
	withLegacyDatabase(async (client, path, directory) => {
		const snapshot = join(directory, "before.json");
		const before = verify(path, "snapshot", snapshot);
		assert.equal(before.status, 0, before.stderr);
		await client.executeMultiple(await readMigration("0023_receipts"));
		const after = verify(path, "check", snapshot);
		assert.equal(after.status, 0, `${after.stdout}${after.stderr}`);
		assert.match(after.stdout, /"differences":0/);

		assert.deepEqual(
			await rows(
				client,
				"SELECT housemate_id,amount_cents,received_at,kind,bank_transaction_id,note FROM receipts ORDER BY housemate_id,received_at,amount_cents",
			),
			[
				[
					"oliver",
					5000,
					t - 500,
					"cash",
					null,
					"Recorded as paid before the ledger",
				],
				["oliver", 9000, t + 100, "bank", "tx-a", ""],
				["oliver", 2000, t + 150, "cash", null, "At dinner"],
				["oliver", 4000, t + 200, "bank", "tx-split", ""],
				["oliver", 6000, t + 300, "bank", "tx-linked", "Manual rent"],
				["oliver", -2500, t + 500, "bank", "tx-refund", ""],
				["sarah", 1500, t + 60, "cash", null, "Old transfer"],
				["sarah", 500, t + 70, "cash", null, "Rent top up"],
				["sarah", 3000, t + 200, "bank", "tx-split", ""],
			],
		);
		assert.deepEqual(
			await rows(
				client,
				"SELECT id,decision,decided_at IS NOT NULL FROM bank_transactions ORDER BY id",
			),
			[
				["tx-a", "confirmed", 1],
				["tx-archived", "archived", 0],
				["tx-excluded", "excluded", 0],
				["tx-linked", "confirmed", 1],
				["tx-refund", "confirmed", 1],
				["tx-reversed", "review", 1],
				["tx-review", "review", 0],
				["tx-split", "confirmed", 1],
			],
		);
		assert.deepEqual(
			await rows(
				client,
				"SELECT r.kind,r.note,a.debt_id,a.amount_cents FROM allocations a JOIN receipts r ON r.id=a.receipt_id ORDER BY a.debt_id,r.kind",
			),
			[
				["bank", "", "gas-o", 6000],
				["bank", "", "gas-s", 3000],
				["cash", "Recorded as paid before the ledger", "old-o", 5000],
				["bank", "Manual rent", "rent-o", 6000],
				["cash", "At dinner", "rent-o", 2000],
				["cash", "Old transfer", "rent-s", 1500],
			],
		);
		assert.deepEqual(
			await rows(
				client,
				"SELECT receipt_id,amount_cents FROM allocation_history WHERE receipt_id NOT IN (SELECT id FROM receipts) ORDER BY id",
			),
			[
				["bank:tx-reversed", 1000],
				["bank:tx-reversed", -1000],
			],
		);
		assert.equal(
			(
				await rows(client, "SELECT sum(amount_cents) FROM allocation_history")
			)[0][0],
			23500,
		);
		assert.deepEqual(await rows(client, "SELECT bill_id FROM bill_reviews"), [
			["gas"],
		]);
		assert.deepEqual(
			await rows(
				client,
				"SELECT name FROM sqlite_master WHERE name LIKE 'ledger_%' OR name='receipt_keys' OR type='trigger'",
			),
			[],
		);
	}));

test("0023 stops rather than drop an allocation it cannot place", async () =>
	withLegacyDatabase(async (client) => {
		await client.execute(
			"INSERT INTO ledger_bill_allocations(source_key,debt_id,amount_cents,origin) VALUES('bank:tx-a','missing-share',100,'review')",
		);
		await assert.rejects(
			client.executeMultiple(await readMigration("0023_receipts")),
			/NOT NULL/,
		);
	}));

test("the verification script reports a difference and exits 1", async () =>
	withLegacyDatabase(async (client, path, directory) => {
		const snapshot = join(directory, "before.json");
		assert.equal(verify(path, "snapshot", snapshot).status, 0);
		await client.executeMultiple(await readMigration("0023_receipts"));
		await client.execute("DELETE FROM allocations WHERE debt_id='gas-s'");
		const after = verify(path, "check", snapshot);
		assert.equal(after.status, 1);
		assert.match(after.stdout, /gas-s/);
		assert.match(after.stdout, /creditCents/);
	}));

test("0023 stops rather than drop a bank event the journal has not processed", async () =>
	withLegacyDatabase(async (client) => {
		await client.execute(
			"INSERT INTO ledger_events(kind,source_id,payload) VALUES('bank','tx-new','{}')",
		);
		await assert.rejects(
			client.executeMultiple(await readMigration("0023_receipts")),
			/CHECK constraint failed/,
		);
	}));
