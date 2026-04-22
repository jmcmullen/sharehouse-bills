import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { generateEntityId } from "../../../lib/id";
import { bills } from "./bills";
import { housemates } from "./housemates";

export const debts = sqliteTable("debts", {
	id: text("id").primaryKey().$defaultFn(generateEntityId),
	billId: text("bill_id")
		.notNull()
		.references(() => bills.id, { onDelete: "cascade" }),
	housemateId: text("housemate_id")
		.notNull()
		.references(() => housemates.id, { onDelete: "cascade" }),
	amountOwed: real("amount_owed").notNull(),
	amountPaid: real("amount_paid").default(0).notNull(),
	isPaid: integer("is_paid", { mode: "boolean" }).default(false).notNull(),
	paidAt: integer("paid_at", { mode: "timestamp" }),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});
