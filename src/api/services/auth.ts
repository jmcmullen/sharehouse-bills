import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";
import * as schema from "../db/schema/auth";

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "sqlite",
		schema: schema,
	}),
	secret: process.env.BETTER_AUTH_SECRET || "",
	baseURL: process.env.VITE_BASE_URL || "",
	trustedOrigins: [process.env.VITE_BASE_URL || ""],
	emailAndPassword: {
		enabled: true,
		disableSignUp: true,
	},
});
