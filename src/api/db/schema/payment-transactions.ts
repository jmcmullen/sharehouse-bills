import {
	integer,
	real,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { housemates } from "./housemates";

export const paymentTransactions = sqliteTable(
	"payment_transactions",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		transactionId: text("transaction_id").notNull(),
		description: text("description").notNull(),
		amount: real("amount").notNull(),
		housemateId: integer("housemate_id").references(() => housemates.id, {
			onDelete: "set null",
		}),
		status: text("status", {
			enum: ["matched", "unreconciled", "ignored"],
		})
			.notNull()
			.default("unreconciled"),
		matchType: text("match_type", {
			enum: [
				"exact_match",
				"combination_match",
				"partial_allocation",
				"credit_created",
				"manual_match",
				"no_match",
				"ambiguous_match",
				"insufficient_data",
				"ignored",
			],
		}).notNull(),
		matchedDebtIds: text("matched_debt_ids", { mode: "json" }).$type<
			number[]
		>(),
		rawData: text("raw_data", { mode: "json" }),
		settledAt: integer("settled_at", { mode: "timestamp" }),
		upCreatedAt: integer("up_created_at", { mode: "timestamp" }),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	(table) => ({
		transactionIdIdx: uniqueIndex("payment_transactions_transaction_id_idx").on(
			table.transactionId,
		),
	}),
);
