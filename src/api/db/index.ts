import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { requireEnv } from "../../lib/env";
import * as schema from "./schema";

const databaseUrl = requireEnv("DATABASE_URL");
const isRemoteDatabase =
	databaseUrl.startsWith("libsql://") || databaseUrl.startsWith("https://");

const client = createClient({
	url: databaseUrl,
	authToken: isRemoteDatabase
		? requireEnv("DATABASE_AUTH_TOKEN")
		: process.env.DATABASE_AUTH_TOKEN,
});

export const db = drizzle({ client, schema });
