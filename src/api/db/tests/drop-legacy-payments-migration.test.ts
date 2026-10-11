import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { legacyTables } from "../../services/ledger/tests/legacy-tables";

const read = (name: string) =>
	readFile(new URL(`../migrations/${name}.sql`, import.meta.url), "utf8");

test("0021 drops the legacy payment tables and their ledger triggers", async () => {
	const directory = await mkdtemp(join(tmpdir(), "migration-0021-"));
	const client = createClient({ url: `file:${join(directory, "app.db")}` });
	try {
		await client.executeMultiple(legacyTables);
		for (const name of [
			"0009_housemate_ledger",
			"0013_payment_bill_allocations",
			"0015_review_group",
			"0021_drop_legacy_payments",
		])
			await client.executeMultiple(await read(name));
		const names = (
			await client.execute(
				"SELECT name FROM sqlite_master WHERE name LIKE '%payment_transactions%' OR name IN ('unreconciled_transactions','ledger_allocation_issues')",
			)
		).rows.map((row) => row.name);
		assert.deepEqual(names, []);
		const debtTriggers = (
			await client.execute(
				"SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'ledger_capture_debts_%' ORDER BY name",
			)
		).rows.map((row) => row.name);
		assert.deepEqual(debtTriggers, [
			"ledger_capture_debts_delete",
			"ledger_capture_debts_insert",
			"ledger_capture_debts_update",
		]);
	} finally {
		client.close();
		await rm(directory, { recursive: true, force: true });
	}
});
