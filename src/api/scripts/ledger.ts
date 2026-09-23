import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@libsql/client";
import { z } from "zod";
import { ingestBankTransaction } from "../services/ledger/bank-ingest";
import { drainLedgerEvents } from "../services/ledger/events";
import {
	reviewBankTransaction,
	reviewDecisionSchema,
} from "../services/ledger/review-decisions";
import {
	getAccountStatement,
	withWriteTransaction,
} from "../services/ledger/sources";
import { importUpHistory } from "../services/ledger/up-import";

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
		!args.includes("--sync") &&
		!args.includes("--import-up") &&
		!args.includes("--decisions") &&
		!args.includes("--report") &&
		!args.includes("--bank-file")
	) {
		throw new Error(
			"Usage: bun run ledger --sync | --import-up [--since ISO] | --bank-file file.json | --decisions file.json | --report file.json",
		);
	}
	if (args.includes("--sync") || args.includes("--import-up"))
		console.log(
			JSON.stringify({ eventsProcessed: await drainLedgerEvents(client) }),
		);
	if (args.includes("--import-up")) {
		await importUpHistory(client, process.env.UP_BANK_API_TOKEN ?? "", {
			since: option("--since"),
			onProgress: (progress) => console.log(JSON.stringify(progress)),
		});
		await drainLedgerEvents(client);
	}
	const bankPath = option("--bank-file");
	if (bankPath) await importBankFile(bankPath);
	const decisionsPath = option("--decisions");
	if (decisionsPath) {
		const decisions = z
			.array(reviewDecisionSchema)
			.parse(JSON.parse(await readFile(decisionsPath, "utf8")));
		for (const decision of decisions)
			await reviewBankTransaction(client, decision);
		console.log(JSON.stringify({ decisionsApplied: decisions.length }));
	}
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
	const housemates = (
		await client.execute(
			"SELECT id,name,credit_balance FROM housemates WHERE is_owner=0 ORDER BY name",
		)
	).rows;
	const accounts = [];
	for (const housemate of housemates) {
		const statement = await getAccountStatement(client, String(housemate.id));
		const old = (
			await client.execute({
				sql: "SELECT coalesce(sum(round(amount_owed*100)-round(amount_paid*100)),0) AS balance FROM debts WHERE housemate_id=?",
				args: [housemate.id],
			})
		).rows[0];
		const legacyBalanceCents =
			Number(old.balance) - Math.round(Number(housemate.credit_balance) * 100);
		accounts.push({
			housemateId: housemate.id,
			name: housemate.name,
			legacyBalanceCents,
			ledgerBalanceCents: statement.balanceCents,
			differenceCents: statement.balanceCents - legacyBalanceCents,
			entries: statement.entries.length,
		});
	}
	const reviews = (
		await client.execute(
			"SELECT id,description,message,amount_cents,housemate_id,reason,effective_at FROM ledger_bank_transactions WHERE decision='review' ORDER BY effective_at",
		)
	).rows;
	const bankCounts = (
		await client.execute(
			"SELECT decision,count(*) AS count FROM ledger_bank_transactions GROUP BY decision",
		)
	).rows;
	const pendingEvents = Number(
		(
			await client.execute(
				"SELECT count(*) AS count FROM ledger_events WHERE processed_at IS NULL",
			)
		).rows[0].count,
	);
	await writeFile(
		reportPath,
		JSON.stringify(
			{
				generatedAt: new Date().toISOString(),
				pendingEvents,
				accounts,
				bankCounts,
				reviews,
			},
			null,
			2,
		),
	);
	console.log(
		JSON.stringify({
			reportPath,
			pendingEvents,
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
