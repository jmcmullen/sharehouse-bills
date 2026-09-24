import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createClient } from "@libsql/client";

const migration = await readFile(
	new URL("../migrations/0019_overdue_digest.sql", import.meta.url),
	"utf8",
);

test("0019 drops the reminder columns, keeps stack groups and retires unsent reminder rows", async () => {
	const directory = await mkdtemp(join(tmpdir(), "migration-0019-"));
	const client = createClient({ url: `file:${join(directory, "app.db")}` });
	try {
		await client.executeMultiple(`
			CREATE TABLE bills(id TEXT PRIMARY KEY,reminders_enabled INTEGER DEFAULT true NOT NULL,reminder_mode TEXT DEFAULT 'individual' NOT NULL,stack_group TEXT,pre_due_offsets_days TEXT DEFAULT (json_array(1, 0)) NOT NULL,overdue_cadence TEXT DEFAULT 'weekly' NOT NULL,overdue_weekday INTEGER DEFAULT 2);
			CREATE TABLE recurringBills(id TEXT PRIMARY KEY,remindersEnabled INTEGER DEFAULT true NOT NULL,reminderMode TEXT DEFAULT 'individual' NOT NULL,stackGroup TEXT,preDueOffsetsDays TEXT DEFAULT (json_array(1, 0)) NOT NULL,overdueCadence TEXT DEFAULT 'weekly' NOT NULL,overdueWeekday INTEGER DEFAULT 2);
			CREATE TABLE whatsapp_notifications(id TEXT PRIMARY KEY,event_type TEXT,status TEXT,error_message TEXT,completed_at INTEGER,updated_at INTEGER);
			INSERT INTO bills(id,stack_group) VALUES('gas','utilities');
			INSERT INTO recurringBills(id,stackGroup) VALUES('rent',NULL);
			INSERT INTO whatsapp_notifications(id,event_type,status) VALUES('a','bill_reminder','completed'),('b','debt_paid','pending'),('c','bill_reminder','failed'),('d','bill_paid','pending');
		`);
		await client.executeMultiple(
			migration.replaceAll("--> statement-breakpoint", ""),
		);
		const columns = async (table: string) =>
			(await client.execute(`PRAGMA table_info(${table})`)).rows.map(
				(row) => row.name,
			);
		assert.deepEqual(await columns("bills"), ["id", "stack_group"]);
		assert.deepEqual(await columns("recurringBills"), ["id", "stackGroup"]);
		assert.deepEqual(
			(
				await client.execute(
					"SELECT id,status FROM whatsapp_notifications ORDER BY id",
				)
			).rows.map((row) => [row.id, row.status]),
			[
				["a", "completed"],
				["b", "ignored"],
				["c", "ignored"],
				["d", "pending"],
			],
		);
	} finally {
		client.close();
		await rm(directory, { recursive: true, force: true });
	}
});
