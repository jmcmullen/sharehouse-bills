import {
	index,
	integer,
	real,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { recurringBills } from "./recurring-bills";

export const bills = sqliteTable(
	"bills",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		billerName: text("biller_name").notNull(),
		provider: text("provider"),
		billType: text("bill_type", {
			enum: ["electricity", "gas", "internet", "phone", "water", "other"],
		}),
		totalAmount: real("total_amount").notNull(),
		dueDate: integer("due_date", { mode: "timestamp" }).notNull(),
		statementDate: integer("statement_date", { mode: "timestamp" }),
		chargeDueDate: integer("charge_due_date", { mode: "timestamp" }),
		billPeriodStart: integer("bill_period_start", { mode: "timestamp" }),
		billPeriodEnd: integer("bill_period_end", { mode: "timestamp" }),
		status: text("status", { enum: ["pending", "partially_paid", "paid"] })
			.default("pending")
			.notNull(),
		accountNumber: text("account_number"),
		referenceNumber: text("reference_number"),
		sourceFilename: text("source_filename"),
		parseMethod: text("parse_method", {
			enum: ["agl_regex", "hudson_mchugh_regex", "ai"],
		}),
		parseConfidence: real("parse_confidence"),
		sourceFingerprint: text("source_fingerprint"),
		pdfSha256: text("pdf_sha256"),
		pdfUrl: text("pdf_url"), // Optional URL to the original PDF invoice
		recurringBillId: integer("recurring_bill_id").references(
			() => recurringBills.id,
			{ onDelete: "set null" },
		), // Link to recurring bill template
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	(table) => ({
		pdfSha256Idx: index("bills_pdf_sha256_idx").on(table.pdfSha256),
		sourceFingerprintIdx: uniqueIndex("bills_source_fingerprint_idx").on(
			table.sourceFingerprint,
		),
	}),
);
