import { type Client, createClient } from "@libsql/client";

export function createLedgerClient(): Client {
	return createClient({
		url: process.env.DATABASE_URL ?? "",
		authToken: process.env.DATABASE_AUTH_TOKEN,
	});
}
