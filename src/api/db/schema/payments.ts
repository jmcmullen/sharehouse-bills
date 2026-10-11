import { sql } from "drizzle-orm";
import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";
import { debts } from "./debts";
import { housemates } from "./housemates";

// Bank activity as Up reports it, plus the admin's decision about it.
// decided_at is null while the classification is automatic; once set, re-ingest
// keeps the decision.
export const bankTransactions = sqliteTable(
	"bank_transactions",
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
		decision: text("decision", {
			enum: ["review", "confirmed", "excluded", "archived"],
		})
			.notNull()
			.default("review"),
		reason: text("reason").notNull().default(""),
		reviewGroup: text("review_group"),
		decidedAt: integer("decided_at"),
		importedAt: integer("imported_at").notNull(),
		updatedAt: integer("updated_at").notNull(),
	},
	(table) => ({
		review: index("bank_transactions_review").on(
			table.decision,
			table.effectiveAt,
		),
	}),
);

// Money in from a housemate (or a refund out when negative). Receipts are
// voided with a reason, never deleted.
export const receipts = sqliteTable(
	"receipts",
	{
		id: text("id").primaryKey(),
		housemateId: text("housemate_id")
			.notNull()
			.references(() => housemates.id),
		amountCents: integer("amount_cents").notNull(),
		receivedAt: integer("received_at").notNull(),
		kind: text("kind", { enum: ["bank", "cash"] }).notNull(),
		bankTransactionId: text("bank_transaction_id").references(
			() => bankTransactions.id,
		),
		note: text("note").notNull().default(""),
		recordedAt: integer("recorded_at").notNull().default(sql`(unixepoch())`),
		voidedAt: integer("voided_at"),
		voidReason: text("void_reason"),
	},
	(table) => ({
		housemate: index("receipts_housemate").on(table.housemateId),
		bankTransaction: index("receipts_bank_transaction").on(
			table.bankTransactionId,
		),
	}),
);

// Which receipt paid which bill share.
export const allocations = sqliteTable(
	"allocations",
	{
		receiptId: text("receipt_id")
			.notNull()
			.references(() => receipts.id),
		debtId: text("debt_id")
			.notNull()
			.references(() => debts.id, { onDelete: "cascade" }),
		amountCents: integer("amount_cents").notNull(),
	},
	(table) => ({
		pk: primaryKey({ columns: [table.receiptId, table.debtId] }),
		debt: index("allocations_debt").on(table.debtId),
	}),
);

// Append only; negative rows record releases. receipt_id has no foreign key
// so history for voided or migrated money survives.
export const allocationHistory = sqliteTable("allocation_history", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	receiptId: text("receipt_id").notNull(),
	debtId: text("debt_id").notNull(),
	amountCents: integer("amount_cents").notNull(),
	recordedAt: integer("recorded_at").notNull().default(sql`(unixepoch())`),
});

// An admin's tick that a bill's payments look right.
export const billReviews = sqliteTable("bill_reviews", {
	billId: text("bill_id").primaryKey(),
	reviewedAt: integer("reviewed_at").notNull(),
});
