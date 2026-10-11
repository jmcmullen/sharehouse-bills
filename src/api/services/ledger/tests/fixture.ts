import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";
import { ingestBankTransaction } from "../bank-ingest";
import { writeBillAllocation } from "../bill-allocations";
import { drainLedgerEvents } from "../events";
import {
	type BankTransaction,
	type LedgerSource,
	bankTransactionSchema,
} from "../model";
import { applySource, withWriteTransaction } from "../sources";
import { legacyTables } from "./legacy-tables";

const migration = await readFile(
	new URL("../../../db/migrations/0009_housemate_ledger.sql", import.meta.url),
	"utf8",
);
export const time = 1780000000;
export const receipt = (
	id = "bank-1",
	amount = 19900,
	message = "Bills",
): BankTransaction =>
	bankTransactionSchema.parse({
		id,
		attributes: {
			status: "SETTLED",
			description: "Mr Oliver William Caprile",
			rawText: "OLIVER WILLIAM CAPRI",
			message,
			amount: { currencyCode: "AUD", valueInBaseUnits: amount },
			createdAt: new Date(time * 1000).toISOString(),
			settledAt: new Date(time * 1000).toISOString(),
		},
		relationships: {
			account: { data: { id: "spending" } },
			transferAccount: { data: null },
		},
	});
export const charge: LedgerSource = {
	housemateId: "oliver",
	kind: "charge",
	amountCents: 10000,
	description: "Gas",
	billId: "bill",
	effectiveAt: time - 100,
	dueAt: time - 10,
};

export async function fixture(
	run: (client: Client) => Promise<void>,
): Promise<void> {
	const directory = await mkdtemp(join(tmpdir(), "ledger-test-"));
	const client = createClient({ url: `file:${join(directory, "ledger.db")}` });
	try {
		await client.executeMultiple(`${legacyTables}
		INSERT INTO housemates VALUES('oliver','Oliver Caprile','OLIVER WILLIAM CAPRIL',0),('sarah','Sarah O Dwyer',NULL,0),('jay','Jay McMullen',NULL,1);
		INSERT INTO bills(id,biller_name,due_date,created_at) VALUES('bill','Gas',${time - 10},${time - 1000});`);
		await client.executeMultiple(migration);
		await client.executeMultiple(
			await readFile(
				new URL(
					"../../../db/migrations/0011_payment_review_simplification.sql",
					import.meta.url,
				),
				"utf8",
			),
		);
		await client.executeMultiple(
			await readFile(
				new URL(
					"../../../db/migrations/0013_payment_bill_allocations.sql",
					import.meta.url,
				),
				"utf8",
			),
		);
		await client.executeMultiple(
			await readFile(
				new URL(
					"../../../db/migrations/0014_allocation_review_decisions.sql",
					import.meta.url,
				),
				"utf8",
			),
		);
		for (const name of [
			"0015_review_group",
			"0017_freeze_history",
			"0021_drop_legacy_payments",
			"0022_cents",
		])
			await client.executeMultiple(
				await readFile(
					new URL(`../../../db/migrations/${name}.sql`, import.meta.url),
					"utf8",
				),
			);
		await drainLedgerEvents(client);
		await run(client);
	} finally {
		client.close();
		await rm(directory, { recursive: true, force: true });
	}
}

export async function ingest(client: Client, bank = receipt()): Promise<void> {
	await withWriteTransaction(client, (tx) => ingestBankTransaction(tx, bank));
}

// A payment recorded by hand before bank review existed, optionally already
// allocated to the bill share it was recorded against.
export async function manual(
	client: Client,
	options: {
		amountCents?: number;
		key?: string;
		description?: string;
		effectiveAt?: number;
		debtId?: string;
	} = {},
): Promise<void> {
	const amountCents = options.amountCents ?? 19900;
	const key = options.key ?? "manual:manual-1";
	await withWriteTransaction(client, async (tx) => {
		await applySource(tx, key, {
			housemateId: "oliver",
			kind: "payment",
			amountCents: -amountCents,
			description: options.description ?? "Manual payment",
			billId: null,
			effectiveAt: options.effectiveAt ?? time,
			dueAt: null,
		});
		if (options.debtId)
			await writeBillAllocation(tx, key, options.debtId, amountCents, "legacy");
	});
}
