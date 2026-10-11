// Rehearses migration 0023. `snapshot <file>` runs before the migration and
// records, from the journal tables, each housemate's balance and credit and
// each share's paid cents. `check <file>` runs after it, recomputes the same
// figures through the account module and exits 1 on any difference.
import { readFile, writeFile } from "node:fs/promises";
import { type Client, createClient } from "@libsql/client";
import { z } from "zod";
import { loadAccounts } from "../services/account/account.server";

const snapshotSchema = z.object({
	housemates: z.record(
		z.string(),
		z.object({ balanceCents: z.number().int(), creditCents: z.number().int() }),
	),
	debts: z.record(z.string(), z.number().int()),
});
type Snapshot = z.infer<typeof snapshotSchema>;
interface Difference {
	item: string;
	figure: string;
	before: number | null;
	after: number | null;
}

const LIVE_ENTRIES =
	"SELECT e.* FROM ledger_entries e JOIN ledger_sources s ON s.entry_id=e.id";

async function snapshot(client: Client): Promise<Snapshot> {
	const pending = Number(
		(
			await client.execute(
				"SELECT count(*) AS n FROM ledger_events WHERE processed_at IS NULL",
			)
		).rows[0].n,
	);
	if (pending > 0)
		throw new Error(
			`${pending} ledger events are unprocessed. Check out the previous deployed commit (e4b6b89), where \`bun ledger --sync\` exists, run it there to clear the pending events, then take the snapshot on that commit`,
		);
	const housemates = await client.execute(
		`SELECT h.id,
			coalesce((SELECT sum(e.amount_cents) FROM (${LIVE_ENTRIES}) e WHERE e.housemate_id=h.id),0) AS balance,
			coalesce((SELECT -sum(e.amount_cents) FROM (${LIVE_ENTRIES}) e WHERE e.housemate_id=h.id AND e.kind!='charge'),0)
			- coalesce((SELECT sum(a.amount_cents) FROM ledger_bill_allocations a JOIN ledger_sources s ON s.source_key=a.source_key JOIN ledger_entries e ON e.id=s.entry_id WHERE e.housemate_id=h.id),0) AS credit
		FROM housemates h`,
	);
	const debts = await client.execute(
		"SELECT d.id,coalesce((SELECT sum(a.amount_cents) FROM ledger_bill_allocations a WHERE a.debt_id=d.id),0) AS paid FROM debts d",
	);
	return {
		housemates: Object.fromEntries(
			housemates.rows.map((row) => [
				String(row.id),
				{ balanceCents: Number(row.balance), creditCents: Number(row.credit) },
			]),
		),
		debts: Object.fromEntries(
			debts.rows.map((row) => [String(row.id), Number(row.paid)]),
		),
	};
}

async function current(client: Client): Promise<Snapshot> {
	const accounts = await loadAccounts({ client });
	return {
		housemates: Object.fromEntries(
			accounts.map((account) => [
				account.housemate.id,
				{
					balanceCents: account.balanceCents,
					creditCents: account.creditCents,
				},
			]),
		),
		debts: Object.fromEntries(
			accounts.flatMap((account) =>
				account.shares.map((share) => [share.id, share.paidCents]),
			),
		),
	};
}

function compare(before: Snapshot, after: Snapshot): Difference[] {
	const ids = (left: object, right: object) => [
		...new Set([...Object.keys(left), ...Object.keys(right)]),
	];
	const housemates = ids(before.housemates, after.housemates).flatMap((id) =>
		(["balanceCents", "creditCents"] as const).map((figure) => ({
			item: `housemate ${id}`,
			figure,
			before: before.housemates[id]?.[figure] ?? null,
			after: after.housemates[id]?.[figure] ?? null,
		})),
	);
	const debts = ids(before.debts, after.debts).map((id) => ({
		item: `debt ${id}`,
		figure: "paidCents",
		before: before.debts[id] ?? null,
		after: after.debts[id] ?? null,
	}));
	return [...housemates, ...debts].filter((row) => row.before !== row.after);
}

async function main(): Promise<void> {
	const [mode, file] = process.argv.slice(2);
	if (!file || (mode !== "snapshot" && mode !== "check"))
		throw new Error(
			"Usage: bun run src/api/scripts/verify-receipts-migration.ts snapshot|check <file.json>",
		);
	const client = createClient({
		url: process.env.DATABASE_URL ?? "",
		authToken: process.env.DATABASE_AUTH_TOKEN,
	});
	try {
		if (mode === "snapshot") {
			const before = await snapshot(client);
			await writeFile(file, `${JSON.stringify(before, null, 2)}\n`);
			console.log(
				JSON.stringify({
					housemates: Object.keys(before.housemates).length,
					debts: Object.keys(before.debts).length,
				}),
			);
			return;
		}
		const before = snapshotSchema.parse(
			JSON.parse(await readFile(file, "utf8")),
		);
		const differences = compare(before, await current(client));
		if (differences.length) {
			console.table(differences);
			process.exitCode = 1;
			return;
		}
		console.log(
			JSON.stringify({
				housemates: Object.keys(before.housemates).length,
				debts: Object.keys(before.debts).length,
				differences: 0,
			}),
		);
	} finally {
		client.close();
	}
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
