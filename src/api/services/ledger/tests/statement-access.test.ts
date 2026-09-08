import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { createStatementLink, getPrivateStatement } from "../statement-access";

test("private statement tokens isolate housemates, expire, rotate and revoke without exposing bank evidence", async () => {
	const directory = await mkdtemp(join(tmpdir(), "statement-access-"));
	const client = createClient({ url: `file:${join(directory, "test.db")}` });
	try {
		await client.executeMultiple(`CREATE TABLE housemates(id TEXT PRIMARY KEY,name TEXT,is_owner INTEGER);
   INSERT INTO housemates VALUES('oliver','Oliver',0),('sarah','Sarah',0),('owner','Owner',1);
   CREATE TABLE ledger_statement_links(housemate_id TEXT PRIMARY KEY,token_hash TEXT UNIQUE,created_at INTEGER,expires_at INTEGER);
   CREATE TABLE ledger_entries(id TEXT,housemate_id TEXT,source_key TEXT,kind TEXT,amount_cents INTEGER,description TEXT,bill_id TEXT,effective_at INTEGER,due_at INTEGER,recorded_at INTEGER,reverses_entry_id TEXT);
   INSERT INTO ledger_entries VALUES('1','oliver','bank:secret-bank-id','payment',-3000,'Private sender details',NULL,100,NULL,100,NULL),('2','sarah','bank:sarah','payment',-7000,'Sarah private details',NULL,100,NULL,100,NULL);
   CREATE TABLE ledger_bank_transactions(housemate_id TEXT,decision TEXT,amount_cents INTEGER);
   CREATE TABLE ledger_events(id INTEGER,kind TEXT,payload TEXT,processed_at INTEGER);`);
		const link = await createStatementLink(client, "oliver", 1000);
		const token = link.path.split("/").at(-1) ?? "";
		assert.equal(
			(await getPrivateStatement(client, token, 1001))?.balanceCents,
			-3000,
		);
		const serialized = JSON.stringify(
			await getPrivateStatement(client, token, 1001),
		);
		for (const secret of [
			"Sarah",
			"secret-bank-id",
			"Private sender details",
			"housemateId",
			"sourceKey",
		])
			assert.ok(!serialized.includes(secret));
		assert.equal(
			await getPrivateStatement(client, `${token.slice(0, -1)}!`, 1001),
			null,
		);
		assert.equal(
			await getPrivateStatement(client, token, link.expiresAt),
			null,
		);
		await assert.rejects(
			createStatementLink(client, "owner", 1000),
			/not found/,
		);
		const replacement = await createStatementLink(client, "oliver", 1002);
		assert.equal(await getPrivateStatement(client, token, 1003), null);
		await client.execute(
			"DELETE FROM ledger_statement_links WHERE housemate_id='oliver'",
		);
		assert.equal(
			await getPrivateStatement(
				client,
				replacement.path.split("/").at(-1) ?? "",
				1003,
			),
			null,
		);
	} finally {
		client.close();
		await rm(directory, { recursive: true, force: true });
	}
});
