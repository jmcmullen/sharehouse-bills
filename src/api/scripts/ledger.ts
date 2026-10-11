import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@libsql/client";
import { z } from "zod";
import { loadAccounts } from "../services/account/account.server";
import { ingestBankTransaction } from "../services/payments/bank-ingest";
import { withWriteTransaction } from "../services/payments/transaction";
import { importUpHistory } from "../services/payments/up-import";

const client = createClient({
	url: process.env.DATABASE_URL ?? "",
	authToken: process.env.DATABASE_AUTH_TOKEN,
});
const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
	const index = args.indexOf(name);
	return index >= 0 ? args[index + 1] : undefined;
};

async function main(): Promise<void> {
	if (
		!args.includes("--import-up") &&
		!args.includes("--report") &&
		!args.includes("--bank-file")
	) {
		throw new Error(
			"Usage: bun run ledger --import-up [--since ISO] | --bank-file file.json | --report file.json",
		);
	}
	if (args.includes("--import-up"))
		await importUpHistory(client, process.env.UP_BANK_API_TOKEN ?? "", {
			since: option("--since"),
			onProgress: (progress) => console.log(JSON.stringify(progress)),
		});
	const bankPath = option("--bank-file");
	if (bankPath) await importBankFile(bankPath);
	const reportPath = option("--report");
	if (reportPath) await writeReport(reportPath);
}

async function importBankFile(bankPath: string): Promise<void> {
	const snapshot = z
		.object({ complete: z.literal(true), transactions: z.array(z.unknown()) })
		.parse(JSON.parse(await readFile(bankPath, "utf8")));
	for (let offset = 0; offset < snapshot.transactions.length; offset += 20) {
		await withWriteTransaction(client, async (tx) => {
			for (const transaction of snapshot.transactions.slice(
				offset,
				offset + 20,
			))
				await ingestBankTransaction(tx, transaction);
		});
		if (offset % 1000 === 0)
			console.log(
				JSON.stringify({
					bankTransactionsImported: Math.min(
						offset + 20,
						snapshot.transactions.length,
					),
				}),
			);
	}
	console.log(
		JSON.stringify({
			bankTransactionsImported: snapshot.transactions.length,
			complete: true,
		}),
	);
}

async function writeReport(reportPath: string): Promise<void> {
	const accounts = (await loadAccounts({ client }))
		.filter((account) => !account.housemate.isOwner)
		.map((account) => ({
			housemateId: account.housemate.id,
			name: account.housemate.name,
			balanceCents: account.balanceCents,
			creditCents: account.creditCents,
			owesCents: account.owesCents,
			receipts: account.receipts.length,
		}));
	const reviews = (
		await client.execute(
			"SELECT id,description,message,amount_cents,housemate_id,reason,effective_at FROM bank_transactions WHERE decision='review' ORDER BY effective_at",
		)
	).rows;
	const bankCounts = (
		await client.execute(
			"SELECT decision,count(*) AS count FROM bank_transactions GROUP BY decision",
		)
	).rows;
	await writeFile(
		reportPath,
		JSON.stringify(
			{ generatedAt: new Date().toISOString(), accounts, bankCounts, reviews },
			null,
			2,
		),
	);
	console.log(
		JSON.stringify({
			reportPath,
			accounts,
			bankCounts,
			reviewCount: reviews.length,
		}),
	);
}

main()
	.catch((error: unknown) => {
		console.error(
			error instanceof Error ? error.message : "Ledger operation failed",
		);
		process.exitCode = 1;
	})
	.finally(() => client.close());
