import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const ledgerStatementLinks = sqliteTable("ledger_statement_links", {
	housemateId: text("housemate_id").primaryKey(),
	tokenHash: text("token_hash").notNull().unique(),
	createdAt: integer("created_at").notNull(),
	expiresAt: integer("expires_at").notNull(),
});

// References are retained as text so deleting a legacy record cannot erase its audit trail.
export const ledgerEntries = sqliteTable(
	"ledger_entries",
	{
		id: text("id").primaryKey(),
		housemateId: text("housemate_id").notNull(),
		sourceKey: text("source_key").notNull(),
		kind: text("kind").notNull(),
		amountCents: integer("amount_cents").notNull(),
		description: text("description").notNull(),
		billId: text("bill_id"),
		effectiveAt: integer("effective_at").notNull(),
		dueAt: integer("due_at"),
		recordedAt: integer("recorded_at").notNull(),
		reversesEntryId: text("reverses_entry_id"),
	},
	(table) => ({
		accountDate: index("ledger_entries_account_date").on(
			table.housemateId,
			table.effectiveAt,
		),
	}),
);

export const ledgerSources = sqliteTable("ledger_sources", {
	sourceKey: text("source_key").primaryKey(),
	entryId: text("entry_id"),
	snapshot: text("snapshot").notNull(),
});

export const ledgerBankTransactions = sqliteTable(
	"ledger_bank_transactions",
	{
		id: text("id").primaryKey(),
		accountId: text("account_id"),
		amountCents: integer("amount_cents").notNull(),
		currency: text("currency").notNull(),
		bankStatus: text("bank_status").notNull(),
		description: text("description").notNull(),
		message: text("message").notNull(),
		rawText: text("raw_text").notNull(),
		effectiveAt: integer("effective_at").notNull(),
		rawData: text("raw_data").notNull(),
		housemateId: text("housemate_id"),
		decision: text("decision").notNull().default("review"),
		decisionOrigin: text("decision_origin").notNull().default("automatic"),
		reason: text("reason").notNull().default(""),
		linkedSourceKey: text("linked_source_key"),
		importedAt: integer("imported_at").notNull(),
		updatedAt: integer("updated_at").notNull(),
	},
	(table) => ({
		review: index("ledger_bank_review").on(table.decision, table.effectiveAt),
		manualLink: uniqueIndex("ledger_bank_manual_link").on(
			table.linkedSourceKey,
		),
	}),
);

export const ledgerEvents = sqliteTable(
	"ledger_events",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		kind: text("kind").notNull(),
		sourceId: text("source_id").notNull(),
		payload: text("payload").notNull(),
		createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
		processedAt: integer("processed_at"),
	},
	(table) => ({
		pending: index("ledger_events_pending").on(table.processedAt, table.id),
	}),
);
