import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "../db/schema";
import {
	migrateAppTablesToStringIds,
	provisionLatestAppTables,
} from "./migrate-string-ids";

type DatabaseClient = ReturnType<typeof createClient>;

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

async function ensureMigrationsTable(client: DatabaseClient) {
	await client.execute(`
		CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
			id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
			hash TEXT NOT NULL,
			created_at NUMERIC
		)
	`);
}

async function getTableNames(client: DatabaseClient) {
	const result = await client.execute(
		"SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
	);
	return result.rows
		.map((row) => String(row.name))
		.filter((name) => name !== MIGRATIONS_TABLE && name !== "sqlite_sequence");
}

async function getMigrationCount(client: DatabaseClient) {
	const result = await client.execute(
		`SELECT COUNT(*) as count FROM ${MIGRATIONS_TABLE}`,
	);
	const firstRow = result.rows[0];
	if (!firstRow) {
		return 0;
	}

	return Number(firstRow.count);
}

async function markMigrationEntriesApplied(
	client: DatabaseClient,
	migrationsFolder: string,
	entries: MigrationJournal["entries"],
) {
	for (const entry of entries) {
		const migrationHash = readMigrationHash(migrationsFolder, entry.tag);
		await client.execute({
			sql: `INSERT INTO ${MIGRATIONS_TABLE} (hash, created_at) VALUES (?, ?)`,
			args: [migrationHash, entry.when],
		});
	}
}

async function getExistingColumns(client: DatabaseClient, tableName: string) {
	const result = await client.execute(`PRAGMA table_info(${tableName})`);
	return new Set(result.rows.map((row) => String(row.name)));
}

async function bootstrapExistingDatabase(
	client: DatabaseClient,
	migrationsFolder: string,
) {
	const journal = readJournal(migrationsFolder);
	const baselineEntry = journal.entries[0];
	if (!baselineEntry) {
		return;
	}

	const tableNames = await getTableNames(client);
	if (tableNames.length === 0) {
		return;
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

	const existingRecurringBillColumns = await getExistingColumns(
		client,
		"recurringBills",
	);
	const existingHousemateColumns = await getExistingColumns(
		client,
		"housemates",
	);
	const latestSchemaTables = ["payment_transactions", "whatsapp_notifications"];
	const latestSchemaPresent =
		latestSchemaTables.every((tableName) => tableNames.includes(tableName)) &&
		existingBillColumns.has("reminders_enabled") &&
		existingRecurringBillColumns.has("remindersEnabled") &&
		existingHousemateColumns.has("whatsapp_number");
	const journalEntriesToMark = latestSchemaPresent
		? journal.entries
		: [baselineEntry];

	await markMigrationEntriesApplied(
		client,
		migrationsFolder,
		journalEntriesToMark,
	);

	console.log(
		latestSchemaPresent
			? "Bootstrapped existing database and marked all historical migrations as applied."
			: `Bootstrapped existing database and marked migration ${baselineEntry.tag} as applied.`,
	);
}

async function initializeEmptyDatabase(
	client: DatabaseClient,
	migrationsFolder: string,
) {
	await client.execute(`
		CREATE TABLE user (
			id TEXT PRIMARY KEY NOT NULL,
			name TEXT NOT NULL,
			email TEXT NOT NULL,
			email_verified INTEGER NOT NULL,
			image TEXT,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		)
	`);
	await client.execute("CREATE UNIQUE INDEX user_email_unique ON user (email)");
	await client.execute(`
		CREATE TABLE account (
			id TEXT PRIMARY KEY NOT NULL,
			account_id TEXT NOT NULL,
			provider_id TEXT NOT NULL,
			user_id TEXT NOT NULL,
			access_token TEXT,
			refresh_token TEXT,
			id_token TEXT,
			access_token_expires_at INTEGER,
			refresh_token_expires_at INTEGER,
			scope TEXT,
			password TEXT,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			FOREIGN KEY (user_id) REFERENCES user(id)
		)
	`);
	await client.execute(`
		CREATE TABLE session (
			id TEXT PRIMARY KEY NOT NULL,
			expires_at INTEGER NOT NULL,
			token TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			ip_address TEXT,
			user_agent TEXT,
			user_id TEXT NOT NULL,
			FOREIGN KEY (user_id) REFERENCES user(id)
		)
	`);
	await client.execute(
		"CREATE UNIQUE INDEX session_token_unique ON session (token)",
	);
	await client.execute(`
		CREATE TABLE verification (
			id TEXT PRIMARY KEY NOT NULL,
			identifier TEXT NOT NULL,
			value TEXT NOT NULL,
			expires_at INTEGER NOT NULL,
			created_at INTEGER,
			updated_at INTEGER
		)
	`);
	await provisionLatestAppTables(client);

	const journal = readJournal(migrationsFolder);
	await markMigrationEntriesApplied(client, migrationsFolder, journal.entries);
	console.log("Initialized empty database with the latest schema.");
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
	const tableNames = await getTableNames(client);
	if (migrationCount === 0) {
		if (tableNames.length === 0) {
			await initializeEmptyDatabase(client, migrationsFolder);
		} else {
			await bootstrapExistingDatabase(client, migrationsFolder);
			await migrate(db, { migrationsFolder });
		}
	} else {
		await migrate(db, { migrationsFolder });
	}

	const migratedStringIds = await migrateAppTablesToStringIds(client);
	if (migratedStringIds) {
		console.log("Application tables migrated from integer IDs to string IDs.");
	}
	console.log("Database migrations applied successfully.");
}

await main();
