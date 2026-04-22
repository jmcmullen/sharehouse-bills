import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "../db/schema";

const MIGRATIONS_TABLE = "__drizzle_migrations";
const REQUIRED_EXISTING_TABLES = [
	"account",
	"session",
	"user",
	"verification",
	"bills",
	"debts",
	"housemates",
	"recurringBills",
	"recurringBillAssignments",
	"unreconciled_transactions",
	"todo",
] as const;

const BILLS_BOOTSTRAP_COLUMNS = [
	{ name: "provider", sqlType: "TEXT" },
	{ name: "bill_type", sqlType: "TEXT" },
	{ name: "statement_date", sqlType: "INTEGER" },
	{ name: "charge_due_date", sqlType: "INTEGER" },
	{ name: "bill_period_start", sqlType: "INTEGER" },
	{ name: "bill_period_end", sqlType: "INTEGER" },
	{ name: "account_number", sqlType: "TEXT" },
	{ name: "reference_number", sqlType: "TEXT" },
	{ name: "source_filename", sqlType: "TEXT" },
	{ name: "parse_method", sqlType: "TEXT" },
	{ name: "parse_confidence", sqlType: "REAL" },
	{ name: "source_fingerprint", sqlType: "TEXT" },
	{ name: "pdf_sha256", sqlType: "TEXT" },
] as const;

interface MigrationJournal {
	entries: Array<{
		tag: string;
		when: number;
	}>;
}

function getMigrationsFolder() {
	const currentDir = path.dirname(fileURLToPath(import.meta.url));
	return path.resolve(currentDir, "../db/migrations");
}

function readJournal(migrationsFolder: string): MigrationJournal {
	const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
	return JSON.parse(fs.readFileSync(journalPath, "utf8")) as MigrationJournal;
}

function readMigrationHash(migrationsFolder: string, tag: string) {
	const migrationPath = path.join(migrationsFolder, `${tag}.sql`);
	const contents = fs.readFileSync(migrationPath, "utf8");
	return crypto.createHash("sha256").update(contents).digest("hex");
}

async function ensureMigrationsTable(client: ReturnType<typeof createClient>) {
	await client.execute(`
		CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
			id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
			hash TEXT NOT NULL,
			created_at NUMERIC
		)
	`);
}

async function getTableNames(client: ReturnType<typeof createClient>) {
	const result = await client.execute(
		"SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
	);
	return result.rows
		.map((row) => String(row.name))
		.filter((name) => name !== MIGRATIONS_TABLE && name !== "sqlite_sequence");
}

async function getMigrationCount(client: ReturnType<typeof createClient>) {
	const result = await client.execute(
		`SELECT COUNT(*) as count FROM ${MIGRATIONS_TABLE}`,
	);
	const firstRow = result.rows[0];
	if (!firstRow) {
		return 0;
	}

	return Number(firstRow.count);
}

async function getExistingColumns(
	client: ReturnType<typeof createClient>,
	tableName: string,
) {
	const result = await client.execute(`PRAGMA table_info(${tableName})`);
	return new Set(result.rows.map((row) => String(row.name)));
}

async function bootstrapExistingDatabase(
	client: ReturnType<typeof createClient>,
	migrationsFolder: string,
) {
	const journal = readJournal(migrationsFolder);
	const baselineEntry = journal.entries[0];
	if (!baselineEntry) {
		return false;
	}

	const tableNames = await getTableNames(client);
	if (tableNames.length === 0) {
		return false;
	}

	const missingTables = REQUIRED_EXISTING_TABLES.filter(
		(tableName) => !tableNames.includes(tableName),
	);
	if (missingTables.length > 0) {
		throw new Error(
			`Refusing to bootstrap migrations: database is partially initialized and missing tables: ${missingTables.join(", ")}`,
		);
	}

	const existingBillColumns = await getExistingColumns(client, "bills");
	for (const column of BILLS_BOOTSTRAP_COLUMNS) {
		if (!existingBillColumns.has(column.name)) {
			await client.execute(
				`ALTER TABLE bills ADD COLUMN ${column.name} ${column.sqlType}`,
			);
		}
	}

	await client.execute("DROP INDEX IF EXISTS bills_pdf_sha256_idx");
	await client.execute(
		"CREATE INDEX IF NOT EXISTS bills_pdf_sha256_idx ON bills (pdf_sha256)",
	);
	await client.execute(
		"CREATE UNIQUE INDEX IF NOT EXISTS bills_source_fingerprint_idx ON bills (source_fingerprint)",
	);

	const baselineHash = readMigrationHash(migrationsFolder, baselineEntry.tag);
	await client.execute({
		sql: `INSERT INTO ${MIGRATIONS_TABLE} (hash, created_at) VALUES (?, ?)`,
		args: [baselineHash, baselineEntry.when],
	});

	console.log(
		`Bootstrapped existing database and marked migration ${baselineEntry.tag} as applied.`,
	);
	return true;
}

async function main() {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("DATABASE_URL environment variable is required");
	}

	const client = createClient({
		url: databaseUrl,
		authToken: process.env.DATABASE_AUTH_TOKEN,
	});
	const db = drizzle({ client, schema });
	const migrationsFolder = getMigrationsFolder();

	await ensureMigrationsTable(client);

	const migrationCount = await getMigrationCount(client);
	if (migrationCount === 0) {
		await bootstrapExistingDatabase(client, migrationsFolder);
	}

	await migrate(db, { migrationsFolder });
	console.log("Database migrations applied successfully.");
}

await main();
