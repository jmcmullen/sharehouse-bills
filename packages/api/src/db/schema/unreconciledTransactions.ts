import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const unreconciledTransactions = sqliteTable(
	"unreconciled_transactions",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		transactionId: text("transaction_id").notNull().unique(), // Up Bank transaction ID
		description: text("description").notNull(),
		amount: real("amount").notNull(),
		reason: text("reason", {
			enum: ["no_match", "ambiguous_match", "insufficient_data"],
		}).notNull(),
		rawData: text("raw_data", { mode: "json" }), // Store the full transaction data for debugging
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
	},
);
