import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { generateEntityId } from "../../../lib/id";

export const todo = sqliteTable("todo", {
	id: text("id").primaryKey().$defaultFn(generateEntityId),
	text: text("text").notNull(),
	completed: integer("completed", { mode: "boolean" }).default(false).notNull(),
});
