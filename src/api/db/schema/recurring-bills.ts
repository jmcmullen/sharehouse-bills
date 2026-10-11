// fallow-ignore-file code-duplication
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { generateEntityId } from "../../../lib/id";

export const recurringBills = sqliteTable("recurringBills", {
	id: text("id").primaryKey().$defaultFn(generateEntityId),
	templateName: text("templateName").notNull(), // "Weekly Rent", "Monthly Utilities"
	billerName: text("billerName").notNull(), // "Property Manager", "Landlord"
	totalCents: integer("totalCents").notNull(), // Base amount in cents (e.g., 189000)
	frequency: text("frequency", {
		enum: ["weekly", "fortnightly", "monthly", "yearly"],
	}).notNull(),
	dayOfWeek: integer("dayOfWeek"), // 0=Sunday, 4=Thursday (for weekly/fortnightly bills)
	dayOfMonth: integer("dayOfMonth"), // 1-31 (for monthly bills)
	startDate: integer("startDate", { mode: "timestamp" }).notNull(), // When pattern begins
	endDate: integer("endDate", { mode: "timestamp" }), // When pattern ends (nullable)
	isActive: integer("isActive", { mode: "boolean" }).notNull().default(true),
	splitStrategy: text("splitStrategy", { enum: ["equal", "custom"] })
		.notNull()
		.default("equal"),
	stackGroup: text("stackGroup"), // Copied to each generated bill
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
