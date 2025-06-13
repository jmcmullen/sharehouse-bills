import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const bills = sqliteTable("bills", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	billerName: text("biller_name").notNull(),
	totalAmount: real("total_amount").notNull(),
	dueDate: integer("due_date", { mode: "timestamp" }).notNull(),
	status: text("status", { enum: ["pending", "partially_paid", "paid"] })
		.default("pending")
		.notNull(),
	pdfUrl: text("pdf_url"), // Optional URL to the original PDF invoice
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});
