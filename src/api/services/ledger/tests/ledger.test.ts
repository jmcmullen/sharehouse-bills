import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { type Client, createClient } from "@libsql/client";
import { getAccountPayments } from "../account-payments";
import { allocateReceipt, recordReceipt } from "../allocation-actions";
import { deleteBankTransaction, ingestBankTransaction } from "../bank-ingest";
import { restoreLegacyAllocations } from "../bill-allocations";
import { drainLedgerEvents } from "../events";
import {
	type BankTransaction,
	type LedgerSource,
	bankTransactionSchema,
	calculateStatement,
	currentStatement,
	identifyHousemate,
} from "../model";
import { loadPaymentReview } from "../payment-review-data";
import {
	reviewBankTransaction,
	reviewBankTransactions,
} from "../review-decisions";
import {
	applySource,
	getAccountStatement,
	withWriteTransaction,
} from "../sources";
import { importUpHistory } from "../up-import";
import { legacyTables } from "./legacy-tables";

const migration = await readFile(
	new URL("../../../db/migrations/0009_housemate_ledger.sql", import.meta.url),
	"utf8",
);
const time = 1780000000;
const receipt = (
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
const charge: LedgerSource = {
	housemateId: "oliver",
	kind: "charge",
	amountCents: 10000,
	description: "Gas",
	billId: "bill",
	effectiveAt: time - 100,
	dueAt: time - 10,
};

async function fixture(run: (client: Client) => Promise<void>): Promise<void> {
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
		for (const name of ["0015_review_group", "0017_freeze_history"])
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

async function ingest(client: Client, bank = receipt()): Promise<void> {
	await withWriteTransaction(client, (tx) => ingestBankTransaction(tx, bank));
}

async function manual(client: Client, amount = 199): Promise<void> {
	await client.execute({
		sql: "INSERT INTO payment_transactions(id,transaction_id,housemate_id,amount,status,source,description,created_at) VALUES ('manual','manual-1','oliver',?,'matched','manual_admin','Manual payment',?)",
		args: [amount, time],
	});
	await drainLedgerEvents(client);
}

test("a non-matching payment immediately reduces the balance and excess remains credit; retries do not duplicate", async () =>
	fixture(async (client) => {
		await withWriteTransaction(client, (tx) =>
			applySource(tx, "charge:1", charge),
		);
		await ingest(client);
		await ingest(client);
		const statement = await getAccountStatement(client, "oliver");
		assert.equal(statement.balanceCents, -9900);
		assert.equal(statement.creditCents, 9900);
		assert.equal(statement.entries.length, 2);
		assert.deepEqual(
			statement.entries.map((entry) => entry.runningBalanceCents),
			[10000, -9900],
		);
	}));

test("approved household words auto-credit; unclear legacy matches still need approval", async () =>
	fixture(async (client) => {
		for (const [index, message] of [
			"Gas",
			"Cleaners",
			"Pool",
			"Bill",
			"Rental",
			"",
			"bills",
			"RENT",
			"Rent clean",
		].entries())
			await ingest(client, receipt(`reference-${index}`, 3000, message));
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			-21000,
		);
		const legacy = receipt("old-match", 19900, "IOU");
		await client.execute({
			sql: "INSERT INTO payment_transactions(id,transaction_id,housemate_id,amount,status,source,description,raw_data,settled_at,created_at) VALUES ('p','old-match','oliver',199,'matched','up_bank','Gas',?,?,?)",
			args: [JSON.stringify(legacy), time, time],
		});
		await drainLedgerEvents(client);
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			-21000,
		);
		const revision = Number(
			(
				await client.execute(
					"SELECT updated_at FROM ledger_bank_transactions WHERE id='old-match'",
				)
			).rows[0].updated_at,
		);
		await reviewBankTransaction(client, {
			transactionId: "old-match",
			action: "credit",
			housemateId: "oliver",
			reason: "Jay confirmed this was gas",
			expectedRevision: revision,
		});
		await assert.rejects(
			reviewBankTransaction(client, {
				transactionId: "old-match",
				action: "exclude",
				reason: "Stale browser decision",
				expectedRevision: revision,
			}),
			/changed since/,
		);
		await ingest(client, legacy);
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			-40900,
		);
	}));

test("unmatched personal receipts are ignored regardless of reference, including after deletion", async () =>
	fixture(async (client) => {
		for (const [index, message] of [
			"",
			"Bills",
			"Rent",
			"Cleaner",
			"Dinner",
		].entries()) {
			const bank = receipt(`personal-${index}`, 5000, message);
			bank.attributes.description = "Personal contact";
			bank.attributes.rawText = "PERSONAL CONTACT";
			await ingest(client, bank);
			await withWriteTransaction(client, (tx) =>
				deleteBankTransaction(tx, bank.id),
			);
		}
		assert.equal(
			(
				await client.execute(
					"SELECT count(*) n FROM ledger_bank_transactions WHERE decision='exclude' AND bank_status='DELETED'",
				)
			).rows[0].n,
			5,
		);
		assert.equal(
			(await client.execute("SELECT count(*) n FROM ledger_entries")).rows[0].n,
			0,
		);
		await ingest(client, receipt("housemate-blank", 5000, ""));
		await ingest(client, receipt("housemate-bills", 3000, "Bills"));
		assert.equal(
			(
				await client.execute(
					"SELECT id FROM ledger_bank_transactions WHERE decision='review'",
				)
			).rows[0].id,
			"housemate-blank",
		);
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			-3000,
		);
	}));

test("housemate-only migration removes old personal reviews while retaining shared receipts and explicit decisions", async () =>
	fixture(async (client) => {
		const personal = receipt("personal", 5000, "Bills");
		personal.attributes.description = "Personal contact";
		personal.attributes.rawText = "PERSONAL CONTACT";
		await ingest(client, personal);
		await ingest(client, { ...personal, id: "approved" });
		await reviewBankTransaction(client, {
			transactionId: "approved",
			action: "credit",
			housemateId: "oliver",
			reason: "Confirmed third-party payment",
		});
		await client.execute(
			"UPDATE ledger_bank_transactions SET decision='review',reason='Housemate not identified' WHERE id='personal'",
		);
		await ingest(client, receipt("shared", 76000, "Oliver + Sarah"));
		await ingest(client, receipt("blank", 3000, ""));
		const before = await getAccountStatement(client, "oliver");
		const sql = await readFile(
			new URL(
				"../../../db/migrations/0012_housemate_only_payment_review.sql",
				import.meta.url,
			),
			"utf8",
		);
		await client.executeMultiple(sql);
		assert.equal(await drainLedgerEvents(client), 2);
		assert.deepEqual(
			(
				await client.execute(
					"SELECT id FROM ledger_bank_transactions WHERE decision='review' ORDER BY id",
				)
			).rows.map((row) => row.id),
			["blank", "shared"],
		);
		assert.equal(
			(
				await client.execute(
					"SELECT decision FROM ledger_bank_transactions WHERE id='personal'",
				)
			).rows[0].decision,
			"exclude",
		);
		assert.deepEqual(await getAccountStatement(client, "oliver"), before);
		await ingest(client, personal);
		await ingest(client, { ...personal, id: "approved" });
		assert.deepEqual(await getAccountStatement(client, "oliver"), before);
	}));

test("blank references remain reviewable while pre-history receipts are archived", async () =>
	fixture(async (client) => {
		await ingest(client, receipt("blank", 77600, ""));
		const historical = receipt("old");
		historical.attributes.settledAt = new Date(
			(time - 10000) * 1000,
		).toISOString();
		await ingest(client, historical);
		assert.equal((await getAccountStatement(client, "oliver")).balanceCents, 0);
		assert.equal(
			(
				await client.execute(
					"SELECT count(*) AS n FROM ledger_bank_transactions WHERE decision='review'",
				)
			).rows[0].n,
			1,
		);
		assert.equal(
			(
				await client.execute(
					"SELECT decision FROM ledger_bank_transactions WHERE id='old'",
				)
			).rows[0].decision,
			"archive",
		);
	}));

test("a manual entry arriving after a bank receipt offers a match without withdrawing an existing credit; linking counts the money once", async () =>
	fixture(async (client) => {
		await ingest(client);
		await manual(client);
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			-39800,
		);
		assert.equal(
			(await client.execute("SELECT decision FROM ledger_bank_transactions"))
				.rows[0].decision,
			"credit",
		);
		await reviewBankTransaction(client, {
			transactionId: "bank-1",
			action: "link",
			housemateId: "oliver",
			manualSourceKey: "manual:manual-1",
			reason: "Same payment verified",
		});
		await ingest(client);
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			-19900,
		);
		await client.execute(
			"UPDATE payment_transactions SET amount=150 WHERE id='manual'",
		);
		await drainLedgerEvents(client);
		assert.equal(
			(await client.execute("SELECT decision FROM ledger_bank_transactions"))
				.rows[0].decision,
			"review",
		);
	}));

test("existing matched legacy payments and bank imports share the same source", async () =>
	fixture(async (client) => {
		const bank = receipt();
		await client.execute({
			sql: "INSERT INTO payment_transactions(id,transaction_id,housemate_id,amount,status,source,description,raw_data,settled_at,created_at) VALUES ('p','bank-1','oliver',199,'matched','up_bank','Gas',?,?,?)",
			args: [JSON.stringify(bank), time, time],
		});
		await drainLedgerEvents(client);
		await ingest(client, bank);
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			-19900,
		);
		assert.equal(
			(await getAccountStatement(client, "oliver")).entries.length,
			1,
		);
		await client.execute(
			"UPDATE payment_transactions SET housemate_id='sarah' WHERE id='p'",
		);
		await drainLedgerEvents(client);
		assert.equal((await getAccountStatement(client, "oliver")).balanceCents, 0);
		assert.equal(
			(await getAccountStatement(client, "sarah")).balanceCents,
			-19900,
		);
	}));

test("a deleted bank transaction cannot be recredited from its stored receipt", async () =>
	fixture(async (client) => {
		await ingest(client, receipt("deleted", 3000, ""));
		await client.execute(
			"UPDATE ledger_bank_transactions SET bank_status='DELETED' WHERE id='deleted'",
		);
		await assert.rejects(
			reviewBankTransaction(client, {
				transactionId: "deleted",
				action: "credit",
				housemateId: "oliver",
				reason: "Must reject deleted receipt",
			}),
			/Deleted bank/,
		);
		assert.equal((await getAccountStatement(client, "oliver")).balanceCents, 0);
	}));

test("legacy charge edits and deletion create immutable corrections, retaining money received", async () =>
	fixture(async (client) => {
		await client.execute(
			`INSERT INTO debts(id,housemate_id,bill_id,amount_owed,amount_paid,created_at) VALUES('d','oliver','bill',100,0,${time - 100})`,
		);
		await drainLedgerEvents(client);
		await ingest(client);
		await client.execute("UPDATE debts SET amount_owed=120 WHERE id='d'");
		await drainLedgerEvents(client);
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			-7900,
		);
		const visible = currentStatement(
			await getAccountStatement(client, "oliver"),
			time + 1000,
		);
		assert.equal(visible.balanceCents, -7900);
		assert.equal(visible.entries.length, 2);
		await client.execute("DELETE FROM debts WHERE id='d'");
		await drainLedgerEvents(client);
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			-19900,
		);
		await assert.rejects(
			client.execute("DELETE FROM ledger_entries"),
			/immutable/,
		);
		await assert.rejects(
			client.execute("UPDATE ledger_entries SET amount_cents=1"),
			/immutable/,
		);
	}));

test("review decisions are idempotent, reassignable and retained on reimport", async () =>
	fixture(async (client) => {
		await ingest(client, receipt("bank-1", 2000, ""));
		const decision = {
			transactionId: "bank-1",
			action: "credit" as const,
			housemateId: "oliver",
			reason: "Confirmed household payment",
		};
		await reviewBankTransaction(client, decision);
		await reviewBankTransaction(client, decision);
		assert.equal(
			(await getAccountStatement(client, "oliver")).entries.length,
			1,
		);
		await reviewBankTransaction(client, { ...decision, housemateId: "sarah" });
		assert.equal((await getAccountStatement(client, "oliver")).balanceCents, 0);
		assert.equal(
			(await getAccountStatement(client, "sarah")).balanceCents,
			-2000,
		);
		await ingest(client, receipt("bank-1", 2000, ""));
		assert.equal(
			(await getAccountStatement(client, "sarah")).balanceCents,
			-2000,
		);
		await reviewBankTransaction(client, {
			transactionId: "bank-1",
			action: "exclude",
			reason: "Previously accounted rent",
		});
		assert.equal((await getAccountStatement(client, "sarah")).balanceCents, 0);
	}));

test("pending and foreign-currency receipts never credit AUD balances", async () =>
	fixture(async (client) => {
		const pending = receipt();
		pending.attributes.status = "HELD";
		pending.attributes.settledAt = null;
		await ingest(client, pending);
		await assert.rejects(
			reviewBankTransaction(client, {
				transactionId: "bank-1",
				action: "credit",
				housemateId: "oliver",
				reason: "Invalid pending receipt",
			}),
			/settled/,
		);
		const foreign = receipt("foreign");
		foreign.attributes.amount.currencyCode = "USD";
		await ingest(client, foreign);
		assert.equal((await getAccountStatement(client, "oliver")).balanceCents, 0);
		await ingest(client);
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			-19900,
		);
	}));

test("refunds increase the balance and a failed transaction rolls back both decision and posting", async () =>
	fixture(async (client) => {
		await ingest(client, receipt("refund", -5000, "Refund"));
		await reviewBankTransaction(client, {
			transactionId: "refund",
			action: "credit",
			housemateId: "oliver",
			reason: "Refund returned to housemate",
		});
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			5000,
		);
		await assert.rejects(
			withWriteTransaction(client, async (tx) => {
				await applySource(tx, "test", charge);
				throw new Error("rollback");
			}),
			/rollback/,
		);
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			5000,
		);
	}));

test("due now and upcoming use account credit without exact invoice matching", () => {
	const entries = [
		{
			...charge,
			id: "1",
			sourceKey: "charge:1",
			recordedAt: time,
			reversesEntryId: null,
		},
		{
			...charge,
			id: "2",
			sourceKey: "charge:2",
			dueAt: time + 86400,
			recordedAt: time,
			reversesEntryId: null,
		},
		{
			...charge,
			id: "3",
			sourceKey: "bank:1",
			kind: "payment" as const,
			amountCents: -15000,
			dueAt: null,
			recordedAt: time,
			reversesEntryId: null,
		},
	];
	const statement = calculateStatement(entries, time);
	assert.equal(statement.balanceCents, 5000);
	assert.equal(statement.dueNowCents, 0);
	assert.equal(statement.upcomingCents, 5000);
});

test("explicit beneficiary takes precedence and middle names do not hide Oliver", () => {
	const housemates = [
		{ id: "oliver", name: "Oliver Caprile", bankAlias: null, isOwner: false },
		{ id: "sarah", name: "Sarah O Dwyer", bankAlias: null, isOwner: false },
	];
	assert.equal(identifyHousemate(receipt(), housemates)?.id, "oliver");
	const forwarded = receipt();
	forwarded.attributes.description = "Sarah O Dwyer";
	forwarded.attributes.rawText = null;
	forwarded.attributes.message = "Bills for Oliver";
	assert.equal(identifyHousemate(forwarded, housemates)?.id, "oliver");
});

test("Up import follows every page and safely reruns without posting duplicates", async () =>
	fixture(async (client) => {
		const original = globalThis.fetch;
		let requests = 0;
		globalThis.fetch = (async (
			input: string | URL | Request,
		): Promise<Response> => {
			requests += 1;
			const second = String(input).includes("cursor=next");
			return Response.json({
				data: [receipt(second ? "second" : "first")],
				links: {
					next: second
						? null
						: "https://api.up.com.au/api/v1/transactions?cursor=next",
				},
			});
		}) as typeof fetch;
		try {
			assert.deepEqual(await importUpHistory(client, "test-token"), {
				pages: 2,
				transactions: 2,
				complete: true,
			});
			await importUpHistory(client, "test-token");
			assert.equal(requests, 4);
			assert.equal(
				(await getAccountStatement(client, "oliver")).balanceCents,
				-39800,
			);
			assert.equal(
				(await getAccountStatement(client, "oliver")).entries.length,
				2,
			);
		} finally {
			globalThis.fetch = original;
		}
	}));

test("household references preserve word boundaries and include singulars and utility names", async () =>
	fixture(async (client) => {
		const accepted = [
			"Cleaner",
			"Cleaners",
			"CLEANING",
			"bill",
			"BILLS",
			"Rent",
			"Gas",
			"Electricity",
			"Water",
			"Internet",
			"Internets",
			"Pool",
			"Rent + pool and water",
		];
		for (const [index, reference] of accepted.entries())
			await ingest(client, receipt(`approved-${index}`, 100, reference));
		for (const reference of [
			"",
			"IOU",
			"Dinner",
			"Bali",
			"Rental",
			"Billboard",
			"Gasoline",
			"Watermelon",
		])
			await ingest(client, receipt(`unclear-${reference}`, 100, reference));
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			-accepted.length * 100,
		);
	}));

test("own-account movements, interest and merchant refunds never become housemate credits", async () =>
	fixture(async (client) => {
		for (const type of ["Interest", "Refund"]) {
			const bank = receipt(type, 100, "Bills");
			bank.attributes.transactionType = type;
			await ingest(client, bank);
			assert.equal(
				(
					await client.execute({
						sql: "SELECT decision FROM ledger_bank_transactions WHERE id=?",
						args: [type],
					})
				).rows[0].decision,
				"exclude",
			);
			await assert.rejects(
				reviewBankTransaction(client, {
					transactionId: type,
					action: "credit",
					housemateId: "oliver",
					reason: "",
				}),
				/cannot be housemate/,
			);
		}
		const transfer = receipt("transfer", 500, "Rent for Oliver");
		transfer.relationships = {
			account: { data: { id: "a" } },
			transferAccount: { data: { id: "b" } },
		};
		await ingest(client, transfer);
		assert.equal(
			(
				await client.execute(
					"SELECT decision FROM ledger_bank_transactions WHERE id='transfer'",
				)
			).rows[0].decision,
			"exclude",
		);
		assert.equal((await getAccountStatement(client, "oliver")).balanceCents, 0);
	}));

test("Matt aliases identify receipts but Matt plus Sarah requires a beneficiary split", async () =>
	fixture(async (client) => {
		await client.execute(
			"INSERT INTO housemates VALUES('matt','Matthew Blair','MATTHEW BLAIR,Matt Blair,Matt',0)",
		);
		const shared = receipt("shared", 76000, "Rent Matt + Sarah");
		shared.attributes.description = "Sarah O Dwyer";
		await ingest(client, shared);
		const bank = (
			await client.execute(
				"SELECT housemate_id,decision FROM ledger_bank_transactions WHERE id='shared'",
			)
		).rows[0];
		assert.equal(bank.housemate_id, null);
		assert.equal(bank.decision, "review");
		const matt = receipt("matt-receipt", 42000, "Rent");
		matt.attributes.description = "Matt Blair";
		matt.attributes.rawText = null;
		await ingest(client, matt);
		assert.equal(
			(await getAccountStatement(client, "matt")).balanceCents,
			-42000,
		);
	}));

test("split receipts conserve cents, survive reimport, can be corrected and reverse when the bank changes", async () =>
	fixture(async (client) => {
		const bank = receipt("split", 76000, "Oliver + Sarah");
		await ingest(client, bank);
		const decision = {
			transactionId: "split",
			action: "split" as const,
			reason: "",
			allocations: [
				{ housemateId: "oliver", amountCents: 40000 },
				{ housemateId: "sarah", amountCents: 36000 },
			],
		};
		await assert.rejects(
			reviewBankTransaction(client, {
				...decision,
				allocations: [
					{ housemateId: "oliver", amountCents: 40000 },
					{ housemateId: "sarah", amountCents: 35000 },
				],
			}),
			/equal the payment/,
		);
		await assert.rejects(
			reviewBankTransaction(client, {
				...decision,
				allocations: [
					{ housemateId: "oliver", amountCents: 40000 },
					{ housemateId: "oliver", amountCents: 36000 },
				],
			}),
			/only once/,
		);
		await assert.rejects(
			reviewBankTransaction(client, {
				...decision,
				allocations: [
					{ housemateId: "oliver", amountCents: 40000 },
					{ housemateId: "jay", amountCents: 36000 },
				],
			}),
			/non-owner/,
		);
		await reviewBankTransaction(client, decision);
		await ingest(client, bank);
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			-40000,
		);
		assert.equal(
			(await getAccountStatement(client, "sarah")).balanceCents,
			-36000,
		);
		assert.equal(
			(await getAccountStatement(client, "oliver")).entries.length,
			1,
		);
		await reviewBankTransaction(client, {
			...decision,
			allocations: [
				{ housemateId: "oliver", amountCents: 38000 },
				{ housemateId: "sarah", amountCents: 38000 },
			],
		});
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			-38000,
		);
		bank.attributes.amount.valueInBaseUnits = 75000;
		await ingest(client, bank);
		assert.equal((await getAccountStatement(client, "oliver")).balanceCents, 0);
		assert.equal((await getAccountStatement(client, "sarah")).balanceCents, 0);
		assert.equal(
			(
				await client.execute(
					"SELECT decision FROM ledger_bank_transactions WHERE id='split'",
				)
			).rows[0].decision,
			"review",
		);
	}));

test("switching split to a single beneficiary, excluding and deleting clears every allocation", async () =>
	fixture(async (client) => {
		await ingest(client, receipt("split-switch", 10000, "IOU"));
		const split = {
			transactionId: "split-switch",
			action: "split" as const,
			reason: "",
			allocations: [
				{ housemateId: "oliver", amountCents: 6000 },
				{ housemateId: "sarah", amountCents: 4000 },
			],
		};
		await reviewBankTransaction(client, split);
		await reviewBankTransaction(client, {
			transactionId: "split-switch",
			action: "credit",
			housemateId: "sarah",
			reason: "",
		});
		assert.equal((await getAccountStatement(client, "oliver")).balanceCents, 0);
		assert.equal(
			(await getAccountStatement(client, "sarah")).balanceCents,
			-10000,
		);
		await reviewBankTransaction(client, split);
		await reviewBankTransaction(client, {
			transactionId: "split-switch",
			action: "exclude",
			reason: "",
		});
		assert.equal((await getAccountStatement(client, "oliver")).balanceCents, 0);
		await reviewBankTransaction(client, split);
		await withWriteTransaction(client, (tx) =>
			deleteBankTransaction(tx, "split-switch"),
		);
		assert.equal((await getAccountStatement(client, "sarah")).balanceCents, 0);
	}));

test("batch review is atomic, rejects stale or duplicate inputs and accepts optional notes", async () =>
	fixture(async (client) => {
		await ingest(client, receipt("batch1", 100, "dinner"));
		await ingest(client, receipt("batch2", 200, "Bali"));
		const rows = (
			await client.execute(
				"SELECT id,updated_at FROM ledger_bank_transactions ORDER BY id",
			)
		).rows;
		const decisions = rows.map((row) => ({
			transactionId: String(row.id),
			action: "exclude" as const,
			reason: "",
			expectedRevision: Number(row.updated_at),
		}));
		await assert.rejects(
			reviewBankTransactions(client, [decisions[0], decisions[0]]),
			/only once/,
		);
		await assert.rejects(
			reviewBankTransactions(client, [
				decisions[0],
				{ ...decisions[1], expectedRevision: 0 },
			]),
			/changed since/,
		);
		assert.equal(
			(
				await client.execute(
					"SELECT count(*) n FROM ledger_bank_transactions WHERE decision='review'",
				)
			).rows[0].n,
			2,
		);
		await reviewBankTransactions(client, decisions);
		await ingest(client, receipt("batch1", 100, "dinner"));
		assert.equal(
			(
				await client.execute(
					"SELECT count(*) n FROM ledger_bank_transactions WHERE decision='exclude'",
				)
			).rows[0].n,
			2,
		);
	}));

test("a legacy match cannot bypass the manual-payment duplicate check", async () =>
	fixture(async (client) => {
		await manual(client);
		const bank = receipt("legacy-duplicate");
		await client.execute({
			sql: "INSERT INTO payment_transactions(id,transaction_id,housemate_id,amount,status,source,description,raw_data,settled_at,created_at) VALUES('legacy-duplicate','legacy-duplicate','oliver',199,'matched','up_bank','Bills',?,?,?)",
			args: [JSON.stringify(bank), time, time],
		});
		await drainLedgerEvents(client);
		assert.equal(
			(
				await client.execute(
					"SELECT decision FROM ledger_bank_transactions WHERE id='legacy-duplicate'",
				)
			).rows[0].decision,
			"review",
		);
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			-19900,
		);
		await assert.rejects(
			reviewBankTransaction(client, {
				transactionId: "legacy-duplicate",
				action: "split",
				reason: "",
				allocations: [
					{ housemateId: "oliver", amountCents: 10000 },
					{ housemateId: "sarah", amountCents: 9900 },
				],
			}),
			/existing payment/,
		);
	}));

async function recordedBillPayments(client: Client): Promise<void> {
	await client.executeMultiple(`
		INSERT INTO bills(id,biller_name,due_date,created_at,bill_type) VALUES('cleaning','Cleaners',${time},${time - 1000},'cleaning');
		INSERT INTO debts(id,housemate_id,bill_id,amount_owed,amount_paid,created_at) VALUES('gas-share','oliver','bill',60,60,${time}),('clean-share','oliver','cleaning',30,30,${time});
		INSERT INTO payment_transactions(id,transaction_id,housemate_id,amount,status,source,description,created_at,matched_debt_ids)
		VALUES('m-gas','m-gas','oliver',60,'matched','manual_admin','Manual gas',${time + 90 * 86400},'["gas-share"]'),('m-clean','m-clean','oliver',30,'matched','manual_admin','Manual cleaning',${time + 90 * 86400},'["clean-share"]');
	`);
	await drainLedgerEvents(client);
}

test("one bank transfer confirms several late-recorded bill payments without extra credit", async () =>
	fixture(async (client) => {
		await recordedBillPayments(client);
		const bank = receipt("combined", 9000, "Bills");
		await ingest(client, bank);
		assert.equal(
			(
				await client.execute(
					"SELECT decision FROM ledger_bank_transactions WHERE id='combined'",
				)
			).rows[0].decision,
			"review",
		);
		const before = await getAccountStatement(client, "oliver");
		assert.equal(before.balanceCents, 0);
		await reviewBankTransaction(client, {
			transactionId: bank.id,
			action: "link",
			housemateId: "oliver",
			manualSourceKeys: ["manual:m-gas", "manual:m-clean"],
			reason: "Confirmed one transfer for both bills",
		});
		await ingest(client, bank);
		assert.deepEqual(await getAccountStatement(client, "oliver"), before);
		const account = await getAccountPayments(client, "oliver");
		assert.equal(account.receipts.length, 1);
		assert.equal(account.receipts[0].amountCents, 9000);
		assert.equal(account.receipts[0].bankMatched, true);
		assert.equal(account.receipts[0].receivedAt, time);
		assert.equal(account.receipts[0].recordedAt, time + 90 * 86400);
		assert.equal(account.receipts[0].allocations.length, 2);
		assert.equal(account.unpaidCents, 0);
		assert.equal(account.unallocatedCents, 0);
		await withWriteTransaction(client, (tx) =>
			deleteBankTransaction(tx, bank.id),
		);
		assert.equal((await getAccountStatement(client, "oliver")).balanceCents, 0);
		assert.equal((await getAccountPayments(client, "oliver")).unpaidCents, 0);
	}));

test("a recorded payment cannot verify two transfers and a changed manual payment releases its bank match", async () =>
	fixture(async (client) => {
		await recordedBillPayments(client);
		await ingest(client, receipt("one", 9000));
		await ingest(client, receipt("two", 9000));
		const match = {
			transactionId: "one",
			action: "link" as const,
			housemateId: "oliver",
			manualSourceKeys: ["manual:m-gas", "manual:m-clean"],
			reason: "",
		};
		await reviewBankTransaction(client, match);
		await assert.rejects(
			reviewBankTransaction(client, { ...match, transactionId: "two" }),
			/already matched/,
		);
		await assert.rejects(
			reviewBankTransaction(client, {
				...match,
				manualSourceKeys: ["manual:m-clean"],
			}),
			/must equal/,
		);
		await client.execute(
			"UPDATE payment_transactions SET amount=50 WHERE id='m-gas'",
		);
		await drainLedgerEvents(client);
		assert.equal(
			(
				await client.execute(
					"SELECT decision FROM ledger_bank_transactions WHERE id='one'",
				)
			).rows[0].decision,
			"review",
		);
		assert.equal(
			(await client.execute("SELECT count(*) n FROM ledger_payment_evidence"))
				.rows[0].n,
			0,
		);
	}));

test("allocations conserve money, reject stale edits and other housemates, and leave excess unallocated", async () =>
	fixture(async (client) => {
		await client.execute(
			`INSERT INTO debts(id,housemate_id,bill_id,amount_owed,amount_paid,created_at) VALUES('gas-share','oliver','bill',60,0,${time})`,
		);
		await drainLedgerEvents(client);
		await ingest(client, receipt("extra", 9000));
		const before = await getAccountPayments(client, "oliver");
		const input = {
			housemateId: "oliver",
			receiptId: "bank:extra",
			allocations: [{ debtId: "gas-share", amountCents: 6000 }],
			expectedRevision: before.revision,
		};
		await allocateReceipt(client, input);
		const after = await getAccountPayments(client, "oliver");
		assert.equal(after.bills[0].remainingCents, 0);
		assert.equal(after.unallocatedCents, 3000);
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			-3000,
		);
		await assert.rejects(allocateReceipt(client, input), /changed/);
		await assert.rejects(
			allocateReceipt(client, {
				...input,
				expectedRevision: after.revision,
				allocations: [{ debtId: "gas-share", amountCents: 10000 }],
			}),
			/exceed/,
		);
		await assert.rejects(
			allocateReceipt(client, {
				...input,
				expectedRevision: after.revision,
				allocations: [{ debtId: "missing", amountCents: 1000 }],
			}),
			/this housemate/,
		);
		await allocateReceipt(client, {
			...input,
			allocations: [],
			expectedRevision: after.revision,
		});
		await withWriteTransaction(client, (tx) => restoreLegacyAllocations(tx));
		assert.equal(
			(await getAccountPayments(client, "oliver")).unallocatedCents,
			9000,
		);
		assert.equal(
			(
				await client.execute(
					"SELECT sum(amount_cents) n FROM ledger_allocation_history",
				)
			).rows[0].n,
			0,
		);
	}));

test("manual paid marks migrate idempotently and rent cannot silently pay utilities", async () =>
	fixture(async (client) => {
		await recordedBillPayments(client);
		const before = await getAccountStatement(client, "oliver");
		await withWriteTransaction(client, (tx) => restoreLegacyAllocations(tx));
		await withWriteTransaction(client, (tx) => restoreLegacyAllocations(tx));
		assert.deepEqual(await getAccountStatement(client, "oliver"), before);
		assert.equal(
			(await client.execute("SELECT count(*) n FROM ledger_bill_allocations"))
				.rows[0].n,
			2,
		);
		assert.equal(
			(await client.execute("SELECT count(*) n FROM ledger_allocation_history"))
				.rows[0].n,
			2,
		);
		await ingest(client, receipt("rent", 12000, "Rent"));
		const account = await getAccountPayments(client, "oliver");
		await assert.rejects(
			allocateReceipt(client, {
				housemateId: "oliver",
				receiptId: "bank:rent",
				allocations: [{ debtId: "gas-share", amountCents: 1 }],
				expectedRevision: account.revision,
			}),
			/remaining share|rent payment/,
		);
	}));

test("confirming an already credited transfer as manual evidence removes only the duplicate credit", async () =>
	fixture(async (client) => {
		await ingest(client, receipt("posted", 9000));
		await reviewBankTransaction(client, {
			transactionId: "posted",
			action: "credit",
			housemateId: "oliver",
			reason: "Previously confirmed receipt",
		});
		await recordedBillPayments(client);
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			-9000,
		);
		await reviewBankTransaction(client, {
			transactionId: "posted",
			action: "link",
			housemateId: "oliver",
			manualSourceKeys: ["manual:m-gas", "manual:m-clean"],
			reason: "Same money already recorded for gas and cleaning",
		});
		assert.equal((await getAccountStatement(client, "oliver")).balanceCents, 0);
		const account = await getAccountPayments(client, "oliver");
		assert.equal(account.receipts.length, 1);
		assert.equal(account.unpaidCents, 0);
		assert.equal(
			account.bills.reduce((sum, bill) => sum + bill.paidCents, 0),
			9000,
		);
	}));

test("review includes possible duplicates already credited, preserves their balance, and honours confirmed separate payments", async () =>
	fixture(async (client) => {
		await recordedBillPayments(client);
		await ingest(client, receipt("old-credit", 9000));
		await withWriteTransaction(client, (tx) =>
			applySource(tx, "bank:old-credit", {
				...charge,
				billId: null,
				kind: "payment",
				amountCents: -9000,
			}),
		);
		await client.execute(
			"UPDATE ledger_bank_transactions SET decision='credit',decision_origin='legacy' WHERE id='old-credit'",
		);
		const personal = receipt("personal-review", 9000);
		personal.attributes.description = "Personal contact";
		personal.attributes.rawText = "Personal contact";
		await ingest(client, personal);
		const before = await getAccountStatement(client, "oliver");
		const queue = await loadPaymentReview(client, {
			group: "duplicate",
			recentOnly: true,
		});
		assert.equal(queue.reviewCount, 1);
		assert.equal(queue.totalReviewCount, 1);
		assert.equal(queue.reviews[0].id, "old-credit");
		assert.equal(queue.reviews[0].matchCandidate, true);
		assert.equal(queue.reviews[0].decision, "credit");
		assert.deepEqual(await getAccountStatement(client, "oliver"), before);
		await reviewBankTransaction(client, {
			transactionId: "old-credit",
			action: "credit",
			housemateId: "oliver",
			reason: "Confirmed this is additional money",
		});
		assert.equal((await loadPaymentReview(client, {})).totalReviewCount, 0);
		assert.equal(
			(await loadPaymentReview(client, { status: "credit" })).reviewCount,
			1,
		);
	}));

test("legacy allocation restores a multi-bill payment after single-bill partial payments and retains excess credit", async () =>
	fixture(async (client) => {
		await client.executeMultiple(
			`INSERT INTO bills(id,biller_name,due_date,created_at) VALUES('second','Water',${time},${time - 1000}); INSERT INTO debts(id,housemate_id,bill_id,amount_owed,amount_paid,created_at) VALUES('first','oliver','bill',100,100,${time}),('second','oliver','second',50,50,${time});`,
		);
		const multi = receipt("multi-legacy", 10000);
		const single = receipt("single-legacy", 5000);
		for (const [bank, id, debtIds] of [
			[multi, "a", ["first", "second"]],
			[single, "z", ["first"]],
		] as const) {
			await client.execute({
				sql: "INSERT INTO payment_transactions(id,transaction_id,housemate_id,amount,status,source,description,raw_data,created_at,matched_debt_ids) VALUES (?,?, 'oliver',?,'matched','up_bank','Bills',?,?,?)",
				args: [
					id,
					bank.id,
					bank.attributes.amount.valueInBaseUnits / 100,
					JSON.stringify(bank),
					time,
					JSON.stringify(debtIds),
				],
			});
		}
		await drainLedgerEvents(client);
		await withWriteTransaction(client, (tx) => restoreLegacyAllocations(tx));
		const account = await getAccountPayments(client, "oliver");
		assert.equal(account.unpaidCents, 0);
		assert.equal(account.unallocatedCents, 0);
		assert.equal(
			account.receipts.find((r) => r.id === "bank:multi-legacy")?.allocations
				.length,
			2,
		);
		await client.execute(
			"UPDATE payment_transactions SET credit_amount=10 WHERE transaction_id='single-legacy'",
		);
		// A retained credit is only applied when first restoring the historical allocation.
		await withWriteTransaction(client, async (tx) => {
			await tx.execute(
				"DELETE FROM ledger_bill_allocations WHERE source_key='bank:single-legacy'",
			);
			await restoreLegacyAllocations(tx, "bank:single-legacy");
		});
		assert.equal(
			(await getAccountPayments(client, "oliver")).receipts.find(
				(r) => r.id === "bank:single-legacy",
			)?.unallocatedCents,
			1000,
		);
	}));

test("recording money rejects likely repeats, requires explicit confirmation for additional money and is retry-safe", async () =>
	fixture(async (client) => {
		await ingest(client, receipt("bank-existing", 12000));
		const account = await getAccountPayments(client, "oliver");
		const input = {
			housemateId: "oliver",
			amountCents: 12000,
			receivedAt: time,
			description: "Bills received",
			expectedRevision: account.revision,
		};
		await assert.rejects(recordReceipt(client, input), /already be recorded/);
		await recordReceipt(client, { ...input, confirmedSeparate: true });
		await assert.rejects(recordReceipt(client, input), /changed/);
		await drainLedgerEvents(client);
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			-24000,
		);
		assert.equal(
			(await getAccountPayments(client, "oliver")).receipts.length,
			2,
		);
		assert.equal((await loadPaymentReview(client, {})).reviewCount, 1);
	}));

test("an explicit removal of a legacy bill allocation survives later backfills", async () =>
	fixture(async (client) => {
		await recordedBillPayments(client);
		const account = await getAccountPayments(client, "oliver");
		await allocateReceipt(client, {
			housemateId: "oliver",
			receiptId: "manual:m-gas",
			allocations: [],
			expectedRevision: account.revision,
		});
		await withWriteTransaction(client, (tx) => restoreLegacyAllocations(tx));
		const after = await getAccountPayments(client, "oliver");
		assert.equal(
			after.receipts.find((receipt) => receipt.id === "manual:m-gas")
				?.allocations.length,
			0,
		);
		assert.equal(after.unallocatedCents, 6000);
		assert.equal((await getAccountStatement(client, "oliver")).balanceCents, 0);
	}));

test("legacy backfill records why a payment stayed unallocated and clears the note once the admin allocates", async () =>
	fixture(async (client) => {
		await client.executeMultiple(`
			INSERT INTO bills(id,biller_name,due_date,created_at,bill_type) VALUES('water','Water',${time},${time - 1000},'water');
			INSERT INTO debts(id,housemate_id,bill_id,amount_owed,amount_paid,created_at) VALUES('gas-share','oliver','bill',60,60,${time}),('water-share','oliver','water',40,40,${time}),('sarah-gas','sarah','bill',60,60,${time});
			INSERT INTO payment_transactions(id,transaction_id,housemate_id,amount,status,source,description,created_at,matched_debt_ids)
			VALUES('m-short','m-short','oliver',80,'matched','manual_admin','Manual gas and water',${time + 86400},'["gas-share","water-share"]'),
			('m-other','m-other','oliver',60,'matched','manual_admin','Manual gas',${time + 86400},'["sarah-gas"]');
		`);
		await drainLedgerEvents(client);
		await withWriteTransaction(client, (tx) => restoreLegacyAllocations(tx));
		const before = await getAccountPayments(client, "oliver");
		const short = before.receipts.find((item) => item.id === "manual:m-short");
		assert.equal(short?.allocations.length, 0);
		assert.equal(
			short?.allocationIssue,
			"Recorded bills need $100.00 but $80.00 was received",
		);
		assert.equal(
			before.receipts.find((item) => item.id === "manual:m-other")
				?.allocationIssue,
			"A bill share this payment was recorded against belongs to another housemate",
		);
		await allocateReceipt(client, {
			housemateId: "oliver",
			receiptId: "manual:m-short",
			allocations: [
				{ debtId: "gas-share", amountCents: 6000 },
				{ debtId: "water-share", amountCents: 2000 },
			],
			expectedRevision: before.revision,
		});
		const after = await getAccountPayments(client, "oliver");
		assert.equal(
			after.receipts.find((item) => item.id === "manual:m-short")
				?.allocationIssue,
			null,
		);
		assert.equal(
			(await client.execute("SELECT count(*) n FROM ledger_allocation_issues"))
				.rows[0].n,
			1,
		);
	}));

const debtState = async (client: Client, id: string) =>
	(
		await client.execute({
			sql: "SELECT amount_paid,is_paid,paid_at FROM debts WHERE id=?",
			args: [id],
		})
	).rows[0];
const billStatus = async (client: Client, id: string) =>
	(
		await client.execute({
			sql: "SELECT status FROM bills WHERE id=?",
			args: [id],
		})
	).rows[0].status;
const allocations = async (client: Client) =>
	(
		await client.execute(
			"SELECT source_key,debt_id,amount_cents,origin FROM ledger_bill_allocations ORDER BY debt_id,source_key",
		)
	).rows.map((row) => [
		String(row.source_key),
		String(row.debt_id),
		Number(row.amount_cents),
		String(row.origin),
	]);

test("allocations write the legacy paid state through and releasing them reverts it", async () =>
	fixture(async (client) => {
		await client.execute(
			`INSERT INTO debts(id,housemate_id,bill_id,amount_owed,amount_paid,created_at) VALUES('gas-share','oliver','bill',60,0,${time}),('sarah-gas','sarah','bill',40,0,${time})`,
		);
		await drainLedgerEvents(client);
		await ingest(client, receipt("pay", 6000));
		const oliver = await getAccountPayments(client, "oliver");
		await allocateReceipt(client, {
			housemateId: "oliver",
			receiptId: "bank:pay",
			allocations: [{ debtId: "gas-share", amountCents: 6000 }],
			expectedRevision: oliver.revision,
		});
		const paid = await debtState(client, "gas-share");
		assert.equal(paid.amount_paid, 60);
		assert.equal(paid.is_paid, 1);
		assert.ok(Number(paid.paid_at) > 0);
		assert.equal(await billStatus(client, "bill"), "partially_paid");
		assert.equal(
			(
				await client.execute(
					"SELECT count(*) n FROM whatsapp_notifications WHERE event_type IN ('bill_paid','debt_paid')",
				)
			).rows[0].n,
			1,
		);

		const sarahBefore = await getAccountPayments(client, "sarah");
		await recordReceipt(client, {
			housemateId: "sarah",
			amountCents: 4000,
			receivedAt: time,
			description: "Cash",
			expectedRevision: sarahBefore.revision,
		});
		const sarah = await getAccountPayments(client, "sarah");
		await allocateReceipt(client, {
			housemateId: "sarah",
			receiptId: sarah.receipts[0].id,
			allocations: [{ debtId: "sarah-gas", amountCents: 4000 }],
			expectedRevision: sarah.revision,
		});
		assert.equal(await billStatus(client, "bill"), "paid");
		assert.deepEqual(
			(
				await client.execute(
					"SELECT event_key,event_type,status,bill_id,debt_id FROM whatsapp_notifications WHERE event_type IN ('bill_paid','debt_paid') ORDER BY event_key",
				)
			).rows.map((row) => [
				row.event_key,
				row.event_type,
				row.status,
				row.bill_id,
				row.debt_id,
			]),
			[
				["bill-paid:bill", "bill_paid", "pending", "bill", null],
				["debt-paid:gas-share", "debt_paid", "pending", null, "gas-share"],
				["debt-paid:sarah-gas", "debt_paid", "pending", null, "sarah-gas"],
			],
		);

		const after = await getAccountPayments(client, "oliver");
		await allocateReceipt(client, {
			housemateId: "oliver",
			receiptId: "bank:pay",
			allocations: [],
			expectedRevision: after.revision,
		});
		const reverted = await debtState(client, "gas-share");
		assert.equal(reverted.amount_paid, 0);
		assert.equal(reverted.is_paid, 0);
		assert.equal(reverted.paid_at, null);
		assert.equal(await billStatus(client, "bill"), "partially_paid");
	}));

test("a manual paid mark recorded as an admin payment settles the debt through the ledger", async () =>
	fixture(async (client) => {
		await client.execute(
			`INSERT INTO debts(id,housemate_id,bill_id,amount_owed,amount_paid,created_at) VALUES('gas-share','oliver','bill',60,0,${time})`,
		);
		await drainLedgerEvents(client);
		await client.execute({
			sql: "INSERT INTO payment_transactions(id,transaction_id,housemate_id,amount,status,source,description,created_at,matched_debt_ids) VALUES ('m','manual-admin-1','oliver',60,'matched','manual_admin','Manual payment for Gas',?,'[\"gas-share\"]')",
			args: [time],
		});
		await drainLedgerEvents(client);
		const paid = await debtState(client, "gas-share");
		assert.equal(paid.amount_paid, 60);
		assert.equal(paid.is_paid, 1);
		assert.equal(await billStatus(client, "bill"), "paid");
		assert.deepEqual(await allocations(client), [
			["manual:manual-admin-1", "gas-share", 6000, "legacy"],
		]);
	}));

test("confirming allocations enqueues one housemate receipt and a numbered correction only when the bills change", async () =>
	fixture(async (client) => {
		await client.executeMultiple(
			`INSERT INTO bills(id,biller_name,due_date,created_at,bill_type) VALUES('cleaning','Cleaners',${time + 86400},${time - 1000},'cleaning');
			INSERT INTO debts(id,housemate_id,bill_id,amount_owed,amount_paid,created_at) VALUES('gas-share','oliver','bill',60,0,${time}),('clean-share','oliver','cleaning',30,0,${time});`,
		);
		await drainLedgerEvents(client);
		await ingest(client, receipt("paid", 9000));
		const receiptRows = () =>
			client.execute(
				"SELECT event_key,event_type,housemate_id,payload FROM whatsapp_notifications WHERE event_type IN ('payment_receipt','payment_correction') ORDER BY event_key",
			);
		const revision = async () =>
			(await getAccountPayments(client, "oliver")).revision;
		assert.deepEqual(
			(await getAccountPayments(client, "oliver")).receipts[0].suggestion,
			{
				allocations: [
					{ debtId: "gas-share", amountCents: 6000 },
					{ debtId: "clean-share", amountCents: 3000 },
				],
				confidence: "combination",
				reason: "Exactly covers Gas · 29 May + Cleaners · 30 May",
			},
		);
		const allocate = async (
			allocations: Array<{ debtId: string; amountCents: number }>,
		) =>
			allocateReceipt(client, {
				housemateId: "oliver",
				receiptId: "bank:paid",
				allocations,
				expectedRevision: await revision(),
			});
		await allocate([{ debtId: "gas-share", amountCents: 6000 }]);
		await allocate([{ debtId: "gas-share", amountCents: 6000 }]);
		const first = (await receiptRows()).rows;
		assert.equal(first.length, 1);
		assert.equal(first[0].event_key, "payment-receipt:bank:paid");
		assert.equal(first[0].event_type, "payment_receipt");
		assert.equal(first[0].housemate_id, "oliver");
		const payload = JSON.parse(String(first[0].payload));
		assert.equal(payload.amountCents, 9000);
		assert.equal(payload.receivedAt, time);
		assert.deepEqual(payload.before, []);
		assert.deepEqual(payload.after, [
			{ debtId: "gas-share", amountCents: 6000 },
		]);
		await allocate([
			{ debtId: "gas-share", amountCents: 6000 },
			{ debtId: "clean-share", amountCents: 3000 },
		]);
		await allocate([]);
		const rows = (await receiptRows()).rows;
		assert.deepEqual(
			rows.map((row) => row.event_key),
			[
				"payment-correction:bank:paid:1",
				"payment-correction:bank:paid:2",
				"payment-receipt:bank:paid",
			],
		);
		const held = JSON.parse(String(rows[1].payload));
		assert.equal(held.before.length, 2);
		assert.deepEqual(held.after, []);
		assert.equal(
			(await getAccountPayments(client, "oliver")).receipts[0].suggestion
				?.confidence,
			"combination",
		);
	}));
