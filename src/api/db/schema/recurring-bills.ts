import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const recurringBills = sqliteTable("recurringBills", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	templateName: text("templateName").notNull(), // "Weekly Rent", "Monthly Utilities"
	billerName: text("billerName").notNull(), // "Property Manager", "Landlord"
	totalAmount: real("totalAmount").notNull(), // Base amount (e.g., 1890.00)
	frequency: text("frequency", {
		enum: ["weekly", "monthly", "yearly"],
	}).notNull(),
	dayOfWeek: integer("dayOfWeek"), // 0=Sunday, 4=Thursday (for weekly bills)
	dayOfMonth: integer("dayOfMonth"), // 1-31 (for monthly bills)
	startDate: integer("startDate", { mode: "timestamp" }).notNull(), // When pattern begins
	endDate: integer("endDate", { mode: "timestamp" }), // When pattern ends (nullable)
	isActive: integer("isActive", { mode: "boolean" }).notNull().default(true),
	splitStrategy: text("splitStrategy", { enum: ["equal", "custom"] })
		.notNull()
		.default("equal"),
	lastGeneratedDate: integer("lastGeneratedDate", { mode: "timestamp" }), // Track last bill creation
	createdAt: integer("createdAt", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer("updatedAt", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date())
		.$onUpdateFn(() => new Date()),
});

export const insertRecurringBillSchema = createInsertSchema(recurringBills);
export const selectRecurringBillSchema = createSelectSchema(recurringBills);

export type RecurringBill = typeof recurringBills.$inferSelect;
export type InsertRecurringBill = typeof recurringBills.$inferInsert;
