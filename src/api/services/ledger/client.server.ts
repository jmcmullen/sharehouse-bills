import type { Client } from "@libsql/client";
import { createClient } from "@libsql/client/http";

export function createLedgerClient(): Client {
	return createClient({
		url: process.env.DATABASE_URL ?? "",
		authToken: process.env.DATABASE_AUTH_TOKEN,
	});
}

export async function withLedgerClient<T>(
	run: (client: Client) => Promise<T>,
): Promise<T> {
	const client = createLedgerClient();
	try {
		return await run(client);
	} finally {
		client.close();
	}
}
