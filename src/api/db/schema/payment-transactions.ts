import {
	integer,
	real,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { generateEntityId } from "../../../lib/id";
import { housemates } from "./housemates";

export const paymentTransactions = sqliteTable(
	"payment_transactions",
	{
		id: text("id").primaryKey().$defaultFn(generateEntityId),
		transactionId: text("transaction_id").notNull(),
		description: text("description").notNull(),
		amount: real("amount").notNull(),
		housemateId: text("housemate_id").references(() => housemates.id, {
			onDelete: "set null",
		}),
		status: text("status", {
			enum: ["matched", "unreconciled", "ignored"],
		})
			.notNull()
			.default("unreconciled"),
		source: text("source", {
			enum: ["up_bank", "manual_reconciliation", "manual_admin"],
		})
			.notNull()
			.default("up_bank"),
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
			string[]
		>(),
		rawData: text("raw_data", { mode: "json" }),
		creditAmount: real("credit_amount").notNull().default(0),
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
