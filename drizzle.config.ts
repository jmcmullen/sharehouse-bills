import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "turso",
	schema: "./src/api/db/schema/*",
	out: "./src/api/db/migrations",
	dbCredentials: {
		url: process.env.DATABASE_URL as string,
		authToken: process.env.DATABASE_AUTH_TOKEN as string,
	},
});
