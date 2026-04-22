import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { requireEnv } from "../../lib/env";
import { db } from "../db";
import * as schema from "../db/schema/auth";

const baseUrl = requireEnv("VITE_BASE_URL");

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "sqlite",
		schema: schema,
	}),
	secret: requireEnv("BETTER_AUTH_SECRET"),
	baseURL: baseUrl,
	trustedOrigins: [
		baseUrl,
		...(process.env.NODE_ENV === "development"
			? ["http://localhost:4000"]
			: []),
	],
	emailAndPassword: {
		enabled: true,
		disableSignUp: true,
	},
});
