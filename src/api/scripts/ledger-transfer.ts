import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import {
	type Client,
	type InStatement,
	type Row,
	createClient,
} from "@libsql/client";
import { z } from "zod";

const legacyTables = [
	"housemates",
	"bills",
	"debts",
	"payment_transactions",
	"unreconciled_transactions",
	"recurringBills",
	"recurringBillAssignments",
];
const ledgerTables = [
	"ledger_entries",
	"ledger_sources",
	"ledger_bank_transactions",
] as const;
const valueSchema = z.union([z.string(), z.number().finite(), z.null()]);
const rowSchema = z.record(z.string(), valueSchema);
const snapshotSchema = z.object({
	version: z.literal(1),
	legacyHash: z.string(),
	ledger_entries: z.array(rowSchema),
	ledger_sources: z.array(rowSchema),
	ledger_bank_transactions: z.array(rowSchema),
	events: z.array(
		z.object({ kind: z.string(), source_id: z.string(), payload: z.string() }),
	),
});

async function readLedgerRows(
	client: Client,
	table: (typeof ledgerTables)[number],
): Promise<Array<z.infer<typeof rowSchema>>> {
	const primaryKey = table === "ledger_sources" ? "source_key" : "id";
	const rows: Array<z.infer<typeof rowSchema>> = [];
	let cursor = "";
	while (true) {
		const result = await client.execute({
			sql: `SELECT * FROM ${table} WHERE ${primaryKey}>? ORDER BY ${primaryKey} LIMIT 250`,
			args: [cursor],
		});
		rows.push(
			...result.rows.map((row) =>
				rowSchema.parse(
					Object.fromEntries(
						result.columns.map((column) => [column, row[column]]),
					),
				),
			),
		);
		const last = result.rows.at(-1);
		if (!last) return rows;
		cursor = String(last[primaryKey]);
	}
}

async function legacyHash(client: Client): Promise<string> {
	const results = await client.batch(
		legacyTables.map((table) => `SELECT * FROM "${table}" ORDER BY id`),
		"read",
	);
	const canonical = results.map((result) =>
		result.rows.map((row) =>
			Object.fromEntries(
				[...result.columns].sort().map((column) => [column, row[column]]),
			),
		),
	);
	return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

async function exportSnapshot(client: Client, path: string): Promise<void> {
	if (
		Number(
			(
				await client.execute(
					"SELECT count(*) AS n FROM ledger_events WHERE processed_at IS NULL",
				)
			).rows[0].n,
		) !== 0
	)
		throw new Error("Sync all ledger events before exporting");
	const data = await Promise.all(
		ledgerTables.map((table) => readLedgerRows(client, table)),
	);
	const events = (
		await client.execute(
			"SELECT kind,source_id,payload FROM ledger_events WHERE processed_at IS NOT NULL",
		)
	).rows;
	const snapshot = snapshotSchema.parse({
		version: 1,
		legacyHash: await legacyHash(client),
		ledger_entries: data[0],
		ledger_sources: data[1],
		ledger_bank_transactions: data[2],
		events,
	});
	await writeFile(path, JSON.stringify(snapshot));
	console.log(
		JSON.stringify({
			exported: path,
			entries: snapshot.ledger_entries.length,
			bankTransactions: snapshot.ledger_bank_transactions.length,
		}),
	);
}

function insertStatement(
	table: string,
	row: z.infer<typeof rowSchema>,
): InStatement {
	const columns = Object.keys(row);
	return {
		sql: `INSERT OR IGNORE INTO ${table} (${columns.map((column) => `"${column}"`).join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
		args: columns.map((column) => row[column]),
	};
}

function sameRow(
	a: Row | z.infer<typeof rowSchema>,
	b: z.infer<typeof rowSchema>,
): boolean {
	return Object.keys(b).every((key) => a[key] === b[key]);
}

async function validateSnapshotTarget(
	client: Client,
	snapshot: z.infer<typeof snapshotSchema>,
): Promise<void> {
	for (const table of ledgerTables) {
		const allowed = new Set(
			(await client.execute(`PRAGMA table_info(${table})`)).rows.map((row) =>
				String(row.name),
			),
		);
		if (allowed.size === 0)
			throw new Error("Install the ledger schema migration first");
		const rows = snapshot[table];
		if (
			rows.some((row) =>
				Object.keys(row).some((column) => !allowed.has(column)),
			)
		)
			throw new Error(`Unexpected columns in ${table}`);
		const primaryKey = table === "ledger_sources" ? "source_key" : "id";
		const existing = new Map(
			(await readLedgerRows(client, table)).map((row) => [
				String(row[primaryKey]),
				row,
			]),
		);
		const expected = new Map(rows.map((row) => [String(row[primaryKey]), row]));
		for (const [key, row] of existing) {
			const match = expected.get(key);
			if (!match || !sameRow(row, match))
				throw new Error(
					`Target ${table} has independent changes; refusing to overwrite ledger data`,
				);
		}
	}
}

async function verifySnapshot(
	client: Client,
	snapshot: z.infer<typeof snapshotSchema>,
): Promise<void> {
	for (const table of ledgerTables) {
		const primaryKey = table === "ledger_sources" ? "source_key" : "id";
		const expected = new Map(
			snapshot[table].map((row) => [String(row[primaryKey]), row]),
		);
		const actual = await readLedgerRows(client, table);
		if (
			actual.length !== expected.size ||
			actual.some((row) => {
				const match = expected.get(String(row[primaryKey]));
				return !match || !sameRow(row, match);
			})
		)
			throw new Error(`Read-back verification failed for ${table}`);
	}
}

async function importSnapshot(client: Client, path: string): Promise<void> {
	const snapshot = snapshotSchema.parse(
		JSON.parse(await readFile(path, "utf8")),
	);
	if ((await legacyHash(client)) !== snapshot.legacyHash)
		throw new Error(
			"Legacy data changed since the rehearsal. Capture a new snapshot and rehearse again before importing",
		);
	await validateSnapshotTarget(client, snapshot);
	for (const table of ledgerTables) {
		const rows = snapshot[table];
		for (let offset = 0; offset < rows.length; offset += 50) {
			await client.batch(
				rows
					.slice(offset, offset + 50)
					.map((row) => insertStatement(table, row)),
				"write",
			);
			if (offset % 1000 === 0)
				console.log(
					JSON.stringify({
						table,
						imported: Math.min(offset + 50, rows.length),
						total: rows.length,
					}),
				);
		}
	}
	const completedAt = Math.floor(Date.now() / 1000);
	for (let offset = 0; offset < snapshot.events.length; offset += 50) {
		await client.batch(
			snapshot.events.slice(offset, offset + 50).map((event) => ({
				sql: "UPDATE ledger_events SET processed_at=? WHERE processed_at IS NULL AND kind=? AND source_id=? AND payload=?",
				args: [completedAt, event.kind, event.source_id, event.payload],
			})),
			"write",
		);
	}
	await verifySnapshot(client, snapshot);
	const pendingEvents = Number(
		(
			await client.execute(
				"SELECT count(*) AS n FROM ledger_events WHERE processed_at IS NULL",
			)
		).rows[0].n,
	);
	console.log(
		JSON.stringify({
			imported: true,
			verified: true,
			legacyUnchanged: (await legacyHash(client)) === snapshot.legacyHash,
			pendingEvents,
		}),
	);
}

const client = createClient({
	url: process.env.DATABASE_URL ?? "",
	authToken: process.env.DATABASE_AUTH_TOKEN,
});
const [mode, path] = process.argv.slice(2);
async function main(): Promise<void> {
	if (!path || !["--export", "--import"].includes(mode))
		throw new Error(
			"Usage: bun run ledger:transfer --export file.json | --import file.json",
		);
	if (mode === "--export") return exportSnapshot(client, path);
	await importSnapshot(client, path);
}
main()
	.catch((error: unknown) => {
		console.error(
			error instanceof Error
				? error.message
				: "Ledger snapshot transfer failed",
		);
		process.exitCode = 1;
	})
	.finally(() => client.close());
