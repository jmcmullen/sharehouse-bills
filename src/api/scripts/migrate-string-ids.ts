import type { createClient } from "@libsql/client";
import { generateEntityId } from "../../lib/id";

type DatabaseClient = ReturnType<typeof createClient>;
type DatabaseRow = Record<string, unknown>;
type SqlArg = string | number | bigint | boolean | Uint8Array | Date | null;

const APP_TABLES = [
	"housemates",
	"recurringBills",
	"bills",
	"debts",
	"recurringBillAssignments",
	"payment_transactions",
	"whatsapp_notifications",
	"todo",
	"unreconciled_transactions",
] as const;

const CREATE_TABLE_STATEMENTS = [
	`CREATE TABLE housemates (
		id TEXT PRIMARY KEY NOT NULL,
		name TEXT NOT NULL,
		email TEXT,
		whatsapp_number TEXT,
		bank_alias TEXT,
		credit_balance REAL DEFAULT 0 NOT NULL,
		is_active INTEGER DEFAULT true NOT NULL,
		is_owner INTEGER DEFAULT false NOT NULL,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	)`,
	`CREATE TABLE recurringBills (
		id TEXT PRIMARY KEY NOT NULL,
		templateName TEXT NOT NULL,
		billerName TEXT NOT NULL,
		totalAmount REAL NOT NULL,
		frequency TEXT NOT NULL,
		dayOfWeek INTEGER,
		dayOfMonth INTEGER,
		startDate INTEGER NOT NULL,
		endDate INTEGER,
		isActive INTEGER DEFAULT true NOT NULL,
		splitStrategy TEXT DEFAULT 'equal' NOT NULL,
		remindersEnabled INTEGER DEFAULT true NOT NULL,
		reminderMode TEXT DEFAULT 'individual' NOT NULL,
		stackGroup TEXT,
		preDueOffsetsDays TEXT DEFAULT '[1]' NOT NULL,
		overdueCadence TEXT DEFAULT 'none' NOT NULL,
		overdueWeekday INTEGER,
		lastGeneratedDate INTEGER,
		createdAt INTEGER NOT NULL,
		updatedAt INTEGER NOT NULL
	)`,
	`CREATE TABLE bills (
		id TEXT PRIMARY KEY NOT NULL,
		biller_name TEXT NOT NULL,
		provider TEXT,
		bill_type TEXT,
		total_amount REAL NOT NULL,
		due_date INTEGER NOT NULL,
		statement_date INTEGER,
		charge_due_date INTEGER,
		bill_period_start INTEGER,
		bill_period_end INTEGER,
		status TEXT DEFAULT 'pending' NOT NULL,
		account_number TEXT,
		reference_number TEXT,
		source_filename TEXT,
		parse_method TEXT,
		parse_confidence REAL,
		source_fingerprint TEXT,
		pdf_sha256 TEXT,
		pdf_url TEXT,
		reminders_enabled INTEGER DEFAULT true NOT NULL,
		reminder_mode TEXT DEFAULT 'individual' NOT NULL,
		stack_group TEXT,
		pre_due_offsets_days TEXT DEFAULT '[1]' NOT NULL,
		overdue_cadence TEXT DEFAULT 'none' NOT NULL,
		overdue_weekday INTEGER,
		recurring_bill_id TEXT,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL,
		FOREIGN KEY (recurring_bill_id) REFERENCES recurringBills(id) ON DELETE set null
	)`,
	`CREATE TABLE debts (
		id TEXT PRIMARY KEY NOT NULL,
		bill_id TEXT NOT NULL,
		housemate_id TEXT NOT NULL,
		amount_owed REAL NOT NULL,
		amount_paid REAL DEFAULT 0 NOT NULL,
		is_paid INTEGER DEFAULT false NOT NULL,
		paid_at INTEGER,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL,
		FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE cascade,
		FOREIGN KEY (housemate_id) REFERENCES housemates(id) ON DELETE cascade
	)`,
	`CREATE TABLE recurringBillAssignments (
		id TEXT PRIMARY KEY NOT NULL,
		recurringBillId TEXT NOT NULL,
		housemateId TEXT NOT NULL,
		customAmount REAL,
		isActive INTEGER DEFAULT true NOT NULL,
		createdAt INTEGER NOT NULL,
		updatedAt INTEGER NOT NULL,
		FOREIGN KEY (recurringBillId) REFERENCES recurringBills(id) ON DELETE cascade,
		FOREIGN KEY (housemateId) REFERENCES housemates(id) ON DELETE cascade
	)`,
	`CREATE TABLE payment_transactions (
		id TEXT PRIMARY KEY NOT NULL,
		transaction_id TEXT NOT NULL,
		description TEXT NOT NULL,
		amount REAL NOT NULL,
		housemate_id TEXT,
		status TEXT DEFAULT 'unreconciled' NOT NULL,
		match_type TEXT NOT NULL,
		matched_debt_ids TEXT,
		raw_data TEXT,
		settled_at INTEGER,
		up_created_at INTEGER,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL,
		FOREIGN KEY (housemate_id) REFERENCES housemates(id) ON DELETE set null
	)`,
	`CREATE TABLE whatsapp_notifications (
		id TEXT PRIMARY KEY NOT NULL,
		event_key TEXT NOT NULL,
		event_type TEXT NOT NULL,
		status TEXT DEFAULT 'pending' NOT NULL,
		bill_id TEXT,
		debt_id TEXT,
		housemate_id TEXT,
		inbound_message_id TEXT,
		inbound_chat_id TEXT,
		inbound_sender_chat_id TEXT,
		error_message TEXT,
		payload TEXT,
		completed_at INTEGER,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL,
		FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE set null,
		FOREIGN KEY (debt_id) REFERENCES debts(id) ON DELETE set null,
		FOREIGN KEY (housemate_id) REFERENCES housemates(id) ON DELETE set null
	)`,
	`CREATE TABLE todo (
		id TEXT PRIMARY KEY NOT NULL,
		text TEXT NOT NULL,
		completed INTEGER DEFAULT false NOT NULL
	)`,
	`CREATE TABLE unreconciled_transactions (
		id TEXT PRIMARY KEY NOT NULL,
		transaction_id TEXT NOT NULL,
		description TEXT NOT NULL,
		amount REAL NOT NULL,
		reason TEXT NOT NULL,
		raw_data TEXT,
		created_at INTEGER NOT NULL
	)`,
] as const;

const CREATE_INDEX_STATEMENTS = [
	"CREATE UNIQUE INDEX housemates_email_unique ON housemates (email)",
	"CREATE UNIQUE INDEX housemates_whatsapp_number_unique ON housemates (whatsapp_number)",
	"CREATE INDEX bills_pdf_sha256_idx ON bills (pdf_sha256)",
	"CREATE UNIQUE INDEX bills_source_fingerprint_idx ON bills (source_fingerprint)",
	"CREATE UNIQUE INDEX payment_transactions_transaction_id_idx ON payment_transactions (transaction_id)",
	"CREATE UNIQUE INDEX whatsapp_notifications_event_key_idx ON whatsapp_notifications (event_key)",
	"CREATE INDEX whatsapp_notifications_event_type_idx ON whatsapp_notifications (event_type)",
	"CREATE INDEX whatsapp_notifications_status_idx ON whatsapp_notifications (status)",
	"CREATE UNIQUE INDEX unreconciled_transactions_transaction_id_unique ON unreconciled_transactions (transaction_id)",
] as const;

function getLegacyTableName(tableName: (typeof APP_TABLES)[number]) {
	return `__legacy_${tableName}`;
}

function toRowRecord(row: unknown): DatabaseRow {
	if (typeof row !== "object" || row === null || Array.isArray(row)) {
		throw new Error("Database row is not an object");
	}

	return row as DatabaseRow;
}

function getRowValue(row: DatabaseRow, key: string) {
	if (!(key in row)) {
		throw new Error(`Missing ${key} in database row`);
	}

	const value = row[key];
	return value === undefined ? null : value;
}

function getLegacyId(row: DatabaseRow) {
	return String(getRowValue(row, "id"));
}

function mapRequiredId(
	idMap: Map<string, string>,
	legacyId: unknown,
	label: string,
) {
	const mappedId = idMap.get(String(legacyId));
	if (!mappedId) {
		throw new Error(
			`Missing migrated ${label} id for legacy value ${legacyId}`,
		);
	}

	return mappedId;
}

function mapOptionalId(idMap: Map<string, string>, legacyId: unknown) {
	if (legacyId === null) {
		return null;
	}

	return mapRequiredId(idMap, legacyId, "foreign");
}

function parseMatchedDebtIds(
	value: unknown,
	debtIdMap: Map<string, string>,
): string[] | null {
	if (value === null) {
		return null;
	}

	const parsedValue =
		typeof value === "string" ? (JSON.parse(value) as unknown) : value;
	if (!Array.isArray(parsedValue)) {
		return null;
	}

	return parsedValue.map((legacyDebtId) =>
		mapRequiredId(debtIdMap, legacyDebtId, "debt"),
	);
}

function stringifyMatchedDebtIds(
	value: unknown,
	debtIdMap: Map<string, string>,
) {
	const matchedDebtIds = parseMatchedDebtIds(value, debtIdMap);
	return matchedDebtIds ? JSON.stringify(matchedDebtIds) : null;
}

async function execute(
	client: DatabaseClient,
	sql: string,
	args: SqlArg[] = [],
) {
	await client.execute({ sql, args });
}

async function queryRows(client: DatabaseClient, sql: string) {
	const result = await client.execute(sql);
	return result.rows.map(toRowRecord);
}

async function getIdColumnType(client: DatabaseClient, tableName: string) {
	const result = await client.execute(`PRAGMA table_info(${tableName})`);
	const idColumn = result.rows
		.map(toRowRecord)
		.find((row) => getRowValue(row, "name") === "id");

	if (!idColumn) {
		throw new Error(`Could not find id column for table ${tableName}`);
	}

	return String(getRowValue(idColumn, "type")).toUpperCase();
}

async function validateMigrationState(client: DatabaseClient) {
	const idColumnTypes = await Promise.all(
		APP_TABLES.map(async (tableName) => ({
			tableName,
			type: await getIdColumnType(client, tableName),
		})),
	);
	const textTables = idColumnTypes.filter((entry) => entry.type === "TEXT");
	if (textTables.length === 0) {
		return "migrate";
	}

	if (textTables.length === APP_TABLES.length) {
		return "skip";
	}

	throw new Error(
		`Refusing string-id migration because the schema is partially migrated: ${idColumnTypes
			.map((entry) => `${entry.tableName}=${entry.type}`)
			.join(", ")}`,
	);
}

async function renameLegacyTables(client: DatabaseClient) {
	for (const tableName of APP_TABLES) {
		await execute(
			client,
			`ALTER TABLE ${tableName} RENAME TO ${getLegacyTableName(tableName)}`,
		);
	}
}

async function createCurrentTables(client: DatabaseClient) {
	for (const statement of CREATE_TABLE_STATEMENTS) {
		await execute(client, statement);
	}
}

async function copyHousemates(client: DatabaseClient) {
	const idMap = new Map<string, string>();
	const rows = await queryRows(
		client,
		`SELECT * FROM ${getLegacyTableName("housemates")} ORDER BY id`,
	);

	for (const row of rows) {
		const newId = generateEntityId();
		idMap.set(getLegacyId(row), newId);
		await execute(
			client,
			`INSERT INTO housemates (
				id, name, email, whatsapp_number, bank_alias, credit_balance, is_active, is_owner, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				newId,
				getRowValue(row, "name") as SqlArg,
				getRowValue(row, "email") as SqlArg,
				getRowValue(row, "whatsapp_number") as SqlArg,
				getRowValue(row, "bank_alias") as SqlArg,
				getRowValue(row, "credit_balance") as SqlArg,
				getRowValue(row, "is_active") as SqlArg,
				getRowValue(row, "is_owner") as SqlArg,
				getRowValue(row, "created_at") as SqlArg,
				getRowValue(row, "updated_at") as SqlArg,
			],
		);
	}

	return idMap;
}

async function copyRecurringBills(client: DatabaseClient) {
	const idMap = new Map<string, string>();
	const rows = await queryRows(
		client,
		`SELECT * FROM ${getLegacyTableName("recurringBills")} ORDER BY id`,
	);

	for (const row of rows) {
		const newId = generateEntityId();
		idMap.set(getLegacyId(row), newId);
		await execute(
			client,
			`INSERT INTO recurringBills (
				id, templateName, billerName, totalAmount, frequency, dayOfWeek, dayOfMonth, startDate, endDate, isActive, splitStrategy,
				remindersEnabled, reminderMode, stackGroup, preDueOffsetsDays, overdueCadence, overdueWeekday, lastGeneratedDate, createdAt, updatedAt
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				newId,
				getRowValue(row, "templateName") as SqlArg,
				getRowValue(row, "billerName") as SqlArg,
				getRowValue(row, "totalAmount") as SqlArg,
				getRowValue(row, "frequency") as SqlArg,
				getRowValue(row, "dayOfWeek") as SqlArg,
				getRowValue(row, "dayOfMonth") as SqlArg,
				getRowValue(row, "startDate") as SqlArg,
				getRowValue(row, "endDate") as SqlArg,
				getRowValue(row, "isActive") as SqlArg,
				getRowValue(row, "splitStrategy") as SqlArg,
				getRowValue(row, "remindersEnabled") as SqlArg,
				getRowValue(row, "reminderMode") as SqlArg,
				getRowValue(row, "stackGroup") as SqlArg,
				getRowValue(row, "preDueOffsetsDays") as SqlArg,
				getRowValue(row, "overdueCadence") as SqlArg,
				getRowValue(row, "overdueWeekday") as SqlArg,
				getRowValue(row, "lastGeneratedDate") as SqlArg,
				getRowValue(row, "createdAt") as SqlArg,
				getRowValue(row, "updatedAt") as SqlArg,
			],
		);
	}

	return idMap;
}

async function copyBills(
	client: DatabaseClient,
	recurringBillIdMap: Map<string, string>,
) {
	const idMap = new Map<string, string>();
	const rows = await queryRows(
		client,
		`SELECT * FROM ${getLegacyTableName("bills")} ORDER BY id`,
	);

	for (const row of rows) {
		const newId = generateEntityId();
		idMap.set(getLegacyId(row), newId);
		await execute(
			client,
			`INSERT INTO bills (
				id, biller_name, provider, bill_type, total_amount, due_date, statement_date, charge_due_date, bill_period_start, bill_period_end,
				status, account_number, reference_number, source_filename, parse_method, parse_confidence, source_fingerprint, pdf_sha256, pdf_url,
				reminders_enabled, reminder_mode, stack_group, pre_due_offsets_days, overdue_cadence, overdue_weekday, recurring_bill_id, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				newId,
				getRowValue(row, "biller_name") as SqlArg,
				getRowValue(row, "provider") as SqlArg,
				getRowValue(row, "bill_type") as SqlArg,
				getRowValue(row, "total_amount") as SqlArg,
				getRowValue(row, "due_date") as SqlArg,
				getRowValue(row, "statement_date") as SqlArg,
				getRowValue(row, "charge_due_date") as SqlArg,
				getRowValue(row, "bill_period_start") as SqlArg,
				getRowValue(row, "bill_period_end") as SqlArg,
				getRowValue(row, "status") as SqlArg,
				getRowValue(row, "account_number") as SqlArg,
				getRowValue(row, "reference_number") as SqlArg,
				getRowValue(row, "source_filename") as SqlArg,
				getRowValue(row, "parse_method") as SqlArg,
				getRowValue(row, "parse_confidence") as SqlArg,
				getRowValue(row, "source_fingerprint") as SqlArg,
				getRowValue(row, "pdf_sha256") as SqlArg,
				getRowValue(row, "pdf_url") as SqlArg,
				getRowValue(row, "reminders_enabled") as SqlArg,
				getRowValue(row, "reminder_mode") as SqlArg,
				getRowValue(row, "stack_group") as SqlArg,
				getRowValue(row, "pre_due_offsets_days") as SqlArg,
				getRowValue(row, "overdue_cadence") as SqlArg,
				getRowValue(row, "overdue_weekday") as SqlArg,
				mapOptionalId(
					recurringBillIdMap,
					getRowValue(row, "recurring_bill_id"),
				),
				getRowValue(row, "created_at") as SqlArg,
				getRowValue(row, "updated_at") as SqlArg,
			],
		);
	}

	return idMap;
}

async function copyDebts(
	client: DatabaseClient,
	billIdMap: Map<string, string>,
	housemateIdMap: Map<string, string>,
) {
	const idMap = new Map<string, string>();
	const rows = await queryRows(
		client,
		`SELECT * FROM ${getLegacyTableName("debts")} ORDER BY id`,
	);

	for (const row of rows) {
		const newId = generateEntityId();
		idMap.set(getLegacyId(row), newId);
		await execute(
			client,
			`INSERT INTO debts (
				id, bill_id, housemate_id, amount_owed, amount_paid, is_paid, paid_at, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				newId,
				mapRequiredId(billIdMap, getRowValue(row, "bill_id"), "bill"),
				mapRequiredId(
					housemateIdMap,
					getRowValue(row, "housemate_id"),
					"housemate",
				),
				getRowValue(row, "amount_owed") as SqlArg,
				getRowValue(row, "amount_paid") as SqlArg,
				getRowValue(row, "is_paid") as SqlArg,
				getRowValue(row, "paid_at") as SqlArg,
				getRowValue(row, "created_at") as SqlArg,
				getRowValue(row, "updated_at") as SqlArg,
			],
		);
	}

	return idMap;
}

async function copyRecurringBillAssignments(
	client: DatabaseClient,
	recurringBillIdMap: Map<string, string>,
	housemateIdMap: Map<string, string>,
) {
	const rows = await queryRows(
		client,
		`SELECT * FROM ${getLegacyTableName("recurringBillAssignments")} ORDER BY id`,
	);

	for (const row of rows) {
		await execute(
			client,
			`INSERT INTO recurringBillAssignments (
				id, recurringBillId, housemateId, customAmount, isActive, createdAt, updatedAt
			) VALUES (?, ?, ?, ?, ?, ?, ?)`,
			[
				generateEntityId(),
				mapRequiredId(
					recurringBillIdMap,
					getRowValue(row, "recurringBillId"),
					"recurring bill",
				),
				mapRequiredId(
					housemateIdMap,
					getRowValue(row, "housemateId"),
					"housemate",
				),
				getRowValue(row, "customAmount") as SqlArg,
				getRowValue(row, "isActive") as SqlArg,
				getRowValue(row, "createdAt") as SqlArg,
				getRowValue(row, "updatedAt") as SqlArg,
			],
		);
	}
}

async function copyPaymentTransactions(
	client: DatabaseClient,
	housemateIdMap: Map<string, string>,
	debtIdMap: Map<string, string>,
) {
	const rows = await queryRows(
		client,
		`SELECT * FROM ${getLegacyTableName("payment_transactions")} ORDER BY id`,
	);

	for (const row of rows) {
		await execute(
			client,
			`INSERT INTO payment_transactions (
				id, transaction_id, description, amount, housemate_id, status, match_type, matched_debt_ids, raw_data, settled_at, up_created_at, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				generateEntityId(),
				getRowValue(row, "transaction_id") as SqlArg,
				getRowValue(row, "description") as SqlArg,
				getRowValue(row, "amount") as SqlArg,
				mapOptionalId(housemateIdMap, getRowValue(row, "housemate_id")),
				getRowValue(row, "status") as SqlArg,
				getRowValue(row, "match_type") as SqlArg,
				stringifyMatchedDebtIds(
					getRowValue(row, "matched_debt_ids"),
					debtIdMap,
				),
				getRowValue(row, "raw_data") as SqlArg,
				getRowValue(row, "settled_at") as SqlArg,
				getRowValue(row, "up_created_at") as SqlArg,
				getRowValue(row, "created_at") as SqlArg,
				getRowValue(row, "updated_at") as SqlArg,
			],
		);
	}
}

async function copyWhatsappNotifications(
	client: DatabaseClient,
	billIdMap: Map<string, string>,
	debtIdMap: Map<string, string>,
	housemateIdMap: Map<string, string>,
) {
	const rows = await queryRows(
		client,
		`SELECT * FROM ${getLegacyTableName("whatsapp_notifications")} ORDER BY id`,
	);

	for (const row of rows) {
		await execute(
			client,
			`INSERT INTO whatsapp_notifications (
				id, event_key, event_type, status, bill_id, debt_id, housemate_id, inbound_message_id, inbound_chat_id, inbound_sender_chat_id,
				error_message, payload, completed_at, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				generateEntityId(),
				getRowValue(row, "event_key") as SqlArg,
				getRowValue(row, "event_type") as SqlArg,
				getRowValue(row, "status") as SqlArg,
				mapOptionalId(billIdMap, getRowValue(row, "bill_id")),
				mapOptionalId(debtIdMap, getRowValue(row, "debt_id")),
				mapOptionalId(housemateIdMap, getRowValue(row, "housemate_id")),
				getRowValue(row, "inbound_message_id") as SqlArg,
				getRowValue(row, "inbound_chat_id") as SqlArg,
				getRowValue(row, "inbound_sender_chat_id") as SqlArg,
				getRowValue(row, "error_message") as SqlArg,
				getRowValue(row, "payload") as SqlArg,
				getRowValue(row, "completed_at") as SqlArg,
				getRowValue(row, "created_at") as SqlArg,
				getRowValue(row, "updated_at") as SqlArg,
			],
		);
	}
}

async function copyTodo(client: DatabaseClient) {
	const rows = await queryRows(
		client,
		`SELECT * FROM ${getLegacyTableName("todo")} ORDER BY id`,
	);

	for (const row of rows) {
		await execute(
			client,
			"INSERT INTO todo (id, text, completed) VALUES (?, ?, ?)",
			[
				generateEntityId(),
				getRowValue(row, "text") as SqlArg,
				getRowValue(row, "completed") as SqlArg,
			],
		);
	}
}

async function copyUnreconciledTransactions(client: DatabaseClient) {
	const rows = await queryRows(
		client,
		`SELECT * FROM ${getLegacyTableName("unreconciled_transactions")} ORDER BY id`,
	);

	for (const row of rows) {
		await execute(
			client,
			`INSERT INTO unreconciled_transactions (
				id, transaction_id, description, amount, reason, raw_data, created_at
			) VALUES (?, ?, ?, ?, ?, ?, ?)`,
			[
				generateEntityId(),
				getRowValue(row, "transaction_id") as SqlArg,
				getRowValue(row, "description") as SqlArg,
				getRowValue(row, "amount") as SqlArg,
				getRowValue(row, "reason") as SqlArg,
				getRowValue(row, "raw_data") as SqlArg,
				getRowValue(row, "created_at") as SqlArg,
			],
		);
	}
}

async function dropLegacyTables(client: DatabaseClient) {
	for (const tableName of [...APP_TABLES].reverse()) {
		await execute(client, `DROP TABLE ${getLegacyTableName(tableName)}`);
	}
}

async function createIndexes(client: DatabaseClient) {
	for (const statement of CREATE_INDEX_STATEMENTS) {
		await execute(client, statement);
	}
}

async function verifyForeignKeys(client: DatabaseClient) {
	const result = await client.execute("PRAGMA foreign_key_check");
	if (result.rows.length > 0) {
		throw new Error(
			`Foreign key check failed after string-id migration: ${JSON.stringify(result.rows)}`,
		);
	}
}

export async function migrateAppTablesToStringIds(client: DatabaseClient) {
	const state = await validateMigrationState(client);
	if (state === "skip") {
		return false;
	}

	await execute(client, "PRAGMA foreign_keys = OFF");

	try {
		await renameLegacyTables(client);
		await createCurrentTables(client);

		const housemateIdMap = await copyHousemates(client);
		const recurringBillIdMap = await copyRecurringBills(client);
		const billIdMap = await copyBills(client, recurringBillIdMap);
		const debtIdMap = await copyDebts(client, billIdMap, housemateIdMap);
		await copyRecurringBillAssignments(
			client,
			recurringBillIdMap,
			housemateIdMap,
		);
		await copyPaymentTransactions(client, housemateIdMap, debtIdMap);
		await copyWhatsappNotifications(
			client,
			billIdMap,
			debtIdMap,
			housemateIdMap,
		);
		await copyTodo(client);
		await copyUnreconciledTransactions(client);
		await dropLegacyTables(client);
		await createIndexes(client);
	} finally {
		await execute(client, "PRAGMA foreign_keys = ON");
	}

	await verifyForeignKeys(client);
	return true;
}

export async function provisionLatestAppTables(client: DatabaseClient) {
	await createCurrentTables(client);
	await createIndexes(client);
	await verifyForeignKeys(client);
}
