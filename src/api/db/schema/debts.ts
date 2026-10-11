// fallow-ignore-file code-duplication
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
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
	amountCents: integer("amount_cents").notNull(),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});
