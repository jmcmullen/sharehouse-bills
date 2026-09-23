import type { Client } from "@libsql/client";
import { z } from "zod";
import { ingestBankTransaction } from "./bank-ingest";
import { bankTransactionSchema } from "./model";
import { withWriteTransaction } from "./sources";

const pageSchema = z.object({
	data: z.array(bankTransactionSchema),
	links: z.object({ next: z.string().nullable() }),
});
interface ImportProgress {
	pages: number;
	transactions: number;
	complete: boolean;
}

export async function importUpHistory(
	client: Client,
	token: string,
	options: {
		since?: string;
		onProgress?: (progress: ImportProgress) => void;
	} = {},
): Promise<ImportProgress> {
	if (!token) throw new Error("UP_BANK_API_TOKEN is required");
	const start = new URL("https://api.up.com.au/api/v1/transactions");
	start.searchParams.set("page[size]", "100");
	if (options.since)
		start.searchParams.set(
			"filter[since]",
			z.iso.datetime({ offset: true }).parse(options.since),
		);
	let next: string | null = start.toString();
	let pages = 0;
	let transactions = 0;
	const visited = new Set<string>();
	while (next) {
		const url = new URL(next);
		if (url.origin !== start.origin || visited.has(next))
			throw new Error("Invalid Up pagination link");
		visited.add(next);
		const response = await fetch(url, {
			headers: { Authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(30000),
		});
		if (!response.ok)
			throw new Error(
				`Up history import failed with HTTP ${response.status}; rerun safely to resume`,
			);
		const page = pageSchema.parse(await response.json());
		// Bound write transactions so bank/network latency cannot hold the database lock.
		for (const transaction of page.data) {
			await withWriteTransaction(client, (tx) =>
				ingestBankTransaction(tx, transaction),
			);
		}
		pages += 1;
		transactions += page.data.length;
		next = page.links.next;
		options.onProgress?.({ pages, transactions, complete: next === null });
	}
	return { pages, transactions, complete: true };
}
