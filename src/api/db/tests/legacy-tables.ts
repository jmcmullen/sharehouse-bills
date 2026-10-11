import { readFile } from "node:fs/promises";

// Minimal app tables as they stood before the ledger migrations, for tests
// that replay raw migration files. Migration 0009
// adds triggers to payment_transactions, so it and unreconciled_transactions
// exist until migration 0021 drops them; migration 0022 turns the dollar
// columns into cents.
export const legacyTables = `CREATE TABLE housemates(id TEXT PRIMARY KEY,name TEXT,bank_alias TEXT,is_owner INTEGER);
CREATE TABLE bills(id TEXT PRIMARY KEY,biller_name TEXT,total_amount REAL DEFAULT 0,due_date INTEGER,created_at INTEGER,status TEXT DEFAULT 'pending',updated_at INTEGER,bill_type TEXT,stack_group TEXT,recurring_bill_id TEXT,bill_period_start INTEGER,bill_period_end INTEGER);
CREATE TABLE recurringBills(id TEXT PRIMARY KEY,templateName TEXT,billerName TEXT,totalAmount REAL DEFAULT 0);
CREATE TABLE recurringBillAssignments(id TEXT PRIMARY KEY,customAmount REAL);
CREATE TABLE debts(id TEXT PRIMARY KEY,housemate_id TEXT,bill_id TEXT,amount_owed REAL,amount_paid REAL DEFAULT 0,created_at INTEGER,is_paid INTEGER DEFAULT 0,paid_at INTEGER,updated_at INTEGER);
CREATE TABLE payment_transactions(id TEXT PRIMARY KEY,transaction_id TEXT UNIQUE,housemate_id TEXT,amount REAL,status TEXT,source TEXT,description TEXT,raw_data TEXT,settled_at INTEGER,up_created_at INTEGER,created_at INTEGER,matched_debt_ids TEXT,credit_amount REAL DEFAULT 0);
CREATE TABLE unreconciled_transactions(id TEXT PRIMARY KEY);
CREATE TABLE whatsapp_notifications(id TEXT PRIMARY KEY,event_key TEXT UNIQUE,event_type TEXT,status TEXT DEFAULT 'pending',bill_id TEXT,debt_id TEXT,housemate_id TEXT,payload TEXT,created_at INTEGER,updated_at INTEGER);`;

export const readMigration = (name: string) =>
	readFile(new URL(`../migrations/${name}.sql`, import.meta.url), "utf8");

// The ledger migrations in order, up to and including 0022.
export const ledgerMigrations = [
	"0009_housemate_ledger",
	"0011_payment_review_simplification",
	"0013_payment_bill_allocations",
	"0014_allocation_review_decisions",
	"0015_review_group",
	"0017_freeze_history",
	"0021_drop_legacy_payments",
	"0022_cents",
];
