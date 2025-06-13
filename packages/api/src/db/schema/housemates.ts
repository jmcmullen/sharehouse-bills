import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const housemates = sqliteTable("housemates", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull(),
	email: text("email").unique(),
	bankAlias: text("bank_alias"), // For matching Up Bank transactions (e.g., "John", "Johnny", "J Smith")
	isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});
