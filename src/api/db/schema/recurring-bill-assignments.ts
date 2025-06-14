import { integer, real, sqliteTable } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { housemates } from "./housemates";
import { recurringBills } from "./recurring-bills";

export const recurringBillAssignments = sqliteTable(
	"recurringBillAssignments",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		recurringBillId: integer("recurringBillId")
			.notNull()
			.references(() => recurringBills.id, { onDelete: "cascade" }),
		housemateId: integer("housemateId")
			.notNull()
			.references(() => housemates.id, { onDelete: "cascade" }),
		customAmount: real("customAmount"), // Override amount for this housemate (nullable)
		isActive: integer("isActive", { mode: "boolean" }).notNull().default(true),
		createdAt: integer("createdAt", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer("updatedAt", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date())
			.$onUpdateFn(() => new Date()),
	},
);

export const insertRecurringBillAssignmentSchema = createInsertSchema(
	recurringBillAssignments,
);
export const selectRecurringBillAssignmentSchema = createSelectSchema(
	recurringBillAssignments,
);

export type RecurringBillAssignment =
	typeof recurringBillAssignments.$inferSelect;
export type InsertRecurringBillAssignment =
	typeof recurringBillAssignments.$inferInsert;
