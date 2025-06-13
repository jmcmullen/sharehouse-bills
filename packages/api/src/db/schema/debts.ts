import { integer, real, sqliteTable } from "drizzle-orm/sqlite-core";
import { bills } from "./bills";
import { housemates } from "./housemates";

export const debts = sqliteTable("debts", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	billId: integer("bill_id")
		.notNull()
		.references(() => bills.id, { onDelete: "cascade" }),
	housemateId: integer("housemate_id")
		.notNull()
		.references(() => housemates.id, { onDelete: "cascade" }),
	amountOwed: real("amount_owed").notNull(),
	isPaid: integer("is_paid", { mode: "boolean" }).default(false).notNull(),
	paidAt: integer("paid_at", { mode: "timestamp" }),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});
