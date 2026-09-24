import type { Client } from "@libsql/client";
import { createClient } from "@libsql/client/http";

export function createLedgerClient(): Client {
	return createClient({
		url: process.env.DATABASE_URL ?? "",
		authToken: process.env.DATABASE_AUTH_TOKEN,
	});
}
