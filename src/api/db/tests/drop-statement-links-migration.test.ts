import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createClient } from "@libsql/client";

const migration = await readFile(
	new URL("../migrations/0020_drop_statement_links.sql", import.meta.url),
	"utf8",
);

test("0020 drops the old statement links and leaves the ledger alone", async () => {
	const directory = await mkdtemp(join(tmpdir(), "migration-0020-"));
	const client = createClient({ url: `file:${join(directory, "app.db")}` });
	try {
		await client.executeMultiple(`
			CREATE TABLE ledger_statement_links(housemate_id TEXT PRIMARY KEY NOT NULL,token_hash TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL);
			CREATE UNIQUE INDEX ledger_statement_links_token_hash_unique ON ledger_statement_links(token_hash);
			INSERT INTO ledger_statement_links VALUES('sarah','hash',1,2);
			CREATE TABLE ledger_entries(id TEXT PRIMARY KEY);
			INSERT INTO ledger_entries VALUES('kept');
		`);
		await client.executeMultiple(
			migration.replaceAll("--> statement-breakpoint", ""),
		);
		const names = (
			await client.execute(
				"SELECT name FROM sqlite_master WHERE name LIKE 'ledger_%' ORDER BY name",
			)
		).rows.map((row) => row.name);
		assert.deepEqual(names, ["ledger_entries"]);
		assert.equal(
			(await client.execute("SELECT count(*) AS n FROM ledger_entries")).rows[0]
				.n,
			1,
		);
	} finally {
		client.close();
		await rm(directory, { recursive: true, force: true });
	}
});
