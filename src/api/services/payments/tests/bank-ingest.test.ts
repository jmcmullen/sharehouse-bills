import assert from "node:assert/strict";
import { test } from "node:test";
import type { Client } from "@libsql/client";
import { loadAccount } from "../../account/account.server";
import { deleteBankTransaction } from "../bank-ingest";
import { decideBankTransaction } from "../decisions";
import { identifyHousemate } from "../model";
import { withWriteTransaction } from "../transaction";
import { importUpHistory } from "../up-import";
import {
	confirm,
	count,
	fixture,
	ingest,
	receipt,
	revision,
	time,
} from "./fixture";

const bankRow = async (client: Client, id: string) =>
	(
		await client.execute({
			sql: "SELECT decision,decided_at,housemate_id,reason,review_group,bank_status FROM bank_transactions WHERE id=?",
			args: [id],
		})
	).rows[0];
const balance = async (client: Client, id = "oliver") =>
	(await loadAccount(id, { client }))?.balanceCents;
const remove = (client: Client, id: string) =>
	withWriteTransaction(client, (tx) => deleteBankTransaction(tx, id));

test("an identified housemate receipt is always reviewed, never credited, whatever the reference says", async () =>
	fixture(async (client) => {
		for (const [index, message] of ["Gas", "RENT", "", "Dinner"].entries())
			await ingest(client, receipt(`ref-${index}`, 3000, message));
		assert.equal(
			await count(
				client,
				"SELECT count(*) n FROM bank_transactions WHERE decision='review' AND review_group='unclear' AND decided_at IS NULL",
			),
			4,
		);
		assert.equal(await count(client, "SELECT count(*) n FROM receipts"), 0);
		assert.match(
			String((await bankRow(client, "ref-0")).reason),
			/confirm the bills/,
		);
	}));

test("unmatched personal receipts are excluded regardless of reference, including after deletion", async () =>
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
			await remove(client, bank.id);
		}
		assert.equal(
			await count(
				client,
				"SELECT count(*) n FROM bank_transactions WHERE decision='excluded' AND bank_status='DELETED'",
			),
			5,
		);
		await ingest(client, receipt("housemate-blank", 5000, ""));
		await ingest(client, receipt("housemate-bills", 3000, "Bills"));
		assert.deepEqual(
			(
				await client.execute(
					"SELECT id FROM bank_transactions WHERE decision='review' ORDER BY id",
				)
			).rows.map((row) => row.id),
			["housemate-bills", "housemate-blank"],
		);
		assert.equal(await balance(client), 0);
	}));

test("blank references remain reviewable while pre-history receipts are archived", async () =>
	fixture(async (client) => {
		await ingest(client, receipt("blank", 77600, ""));
		const historical = receipt("old");
		historical.attributes.settledAt = new Date(
			(time - 10000) * 1000,
		).toISOString();
		await ingest(client, historical);
		assert.equal((await bankRow(client, "blank")).decision, "review");
		assert.equal((await bankRow(client, "old")).decision, "archived");
		assert.equal((await bankRow(client, "old")).housemate_id, "oliver");
	}));

test("own-account movements, interest and merchant refunds are excluded and cannot be confirmed", async () =>
	fixture(async (client) => {
		for (const type of ["Interest", "Refund"]) {
			const bank = receipt(type, 100, "Bills");
			bank.attributes.transactionType = type;
			await ingest(client, bank);
			assert.equal((await bankRow(client, type)).decision, "excluded");
			await assert.rejects(
				confirm(client, type, "oliver"),
				/cannot be housemate/,
			);
		}
		const transfer = receipt("transfer", 500, "Rent for Oliver");
		transfer.relationships = {
			account: { data: { id: "a" } },
			transferAccount: { data: { id: "b" } },
		};
		await ingest(client, transfer);
		assert.equal((await bankRow(client, "transfer")).decision, "excluded");
		assert.equal(await count(client, "SELECT count(*) n FROM receipts"), 0);
	}));

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

test("a sender name the bank cut short still identifies the housemate", () => {
	const housemates = [
		{
			id: "oliver",
			name: "Oliver Caprile",
			bankAlias: "OLIVER WILLIAM CAPRIL",
			isOwner: false,
		},
		{ id: "sarah", name: "Sarah O Dwyer", bankAlias: null, isOwner: false },
	];
	const cut = receipt();
	cut.attributes.description = "OLIVER WILLIAM CAPRI";
	assert.equal(identifyHousemate(cut, housemates)?.id, "oliver");
	const stranger = receipt();
	stranger.attributes.description = "OLIVER LIDDARD";
	stranger.attributes.rawText = "OLIVER LIDDARD";
	assert.equal(identifyHousemate(stranger, housemates), null);
	const short = receipt();
	short.attributes.description = "OLIVER CAP";
	short.attributes.rawText = "OLIVER CAP";
	assert.equal(identifyHousemate(short, housemates), null);
});

test("Matt aliases identify receipts but Matt plus Sarah needs a split", async () =>
	fixture(async (client) => {
		await client.execute(
			`INSERT INTO housemates(id,name,bank_alias,is_owner,is_active,created_at,updated_at) VALUES('matt','Matthew Blair','MATTHEW BLAIR,Matt Blair,Matt',0,1,${time},${time})`,
		);
		const shared = receipt("shared", 76000, "Rent Matt + Sarah");
		shared.attributes.description = "Sarah O Dwyer";
		await ingest(client, shared);
		const bank = await bankRow(client, "shared");
		assert.deepEqual([bank.housemate_id, bank.decision], [null, "review"]);
		assert.equal(bank.review_group, "shared");
		const matt = receipt("matt-receipt", 42000, "Rent");
		matt.attributes.description = "Matt Blair";
		matt.attributes.rawText = null;
		await ingest(client, matt);
		const posted = await bankRow(client, "matt-receipt");
		assert.deepEqual(
			[posted.housemate_id, posted.decision],
			["matt", "review"],
		);
	}));

test("a decided transaction keeps its decision on re-ingest while bank columns update", async () =>
	fixture(async (client) => {
		const bank = receipt("kept", 2000, "Gas");
		await ingest(client, bank);
		await confirm(client, "kept", "oliver");
		const before = await bankRow(client, "kept");
		bank.attributes.message = "Gas for May";
		await ingest(client, bank);
		const after = await bankRow(client, "kept");
		assert.equal(after.decision, "confirmed");
		assert.equal(after.decided_at, before.decided_at);
		assert.equal(await balance(client), -2000);
		assert.equal(
			(await client.execute("SELECT message FROM bank_transactions")).rows[0]
				.message,
			"Gas for May",
		);
		await decideBankTransaction(client, {
			transactionId: "kept",
			action: "exclude",
			reason: "Previously accounted rent",
			expectedRevision: await revision(client, "kept"),
		});
		await ingest(client, bank);
		assert.equal((await bankRow(client, "kept")).decision, "excluded");
		assert.equal(await balance(client), 0);
	}));

test("a changed amount, currency or status voids the receipts and reopens review", async () =>
	fixture(async (client) => {
		for (const [id, change] of [
			[
				"amount",
				(bank: ReturnType<typeof receipt>) => {
					bank.attributes.amount.valueInBaseUnits = 1500;
				},
			],
			[
				"currency",
				(bank: ReturnType<typeof receipt>) => {
					bank.attributes.amount.currencyCode = "USD";
				},
			],
			[
				"status",
				(bank: ReturnType<typeof receipt>) => {
					bank.attributes.status = "HELD";
				},
			],
		] as const) {
			const bank = receipt(id, 2000, "Gas");
			await ingest(client, bank);
			await confirm(client, id, "oliver");
			change(bank);
			await ingest(client, bank);
			const row = await bankRow(client, id);
			assert.equal(row.decision, "review", id);
			assert.notEqual(row.decided_at, null, id);
			assert.match(String(row.reason), /changed/, id);
		}
		assert.equal(
			await count(
				client,
				"SELECT count(*) n FROM receipts WHERE voided_at IS NOT NULL AND void_reason LIKE '%changed%'",
			),
			3,
		);
		assert.equal(await balance(client), 0);
	}));

test("a deleted confirmed transfer voids its receipts and returns to review", async () =>
	fixture(async (client) => {
		await ingest(client, receipt("gone", 4000, "Gas"));
		await confirm(client, "gone", "oliver");
		assert.equal(await balance(client), -4000);
		await remove(client, "gone");
		const row = await bankRow(client, "gone");
		assert.deepEqual(
			[row.decision, row.bank_status, row.decided_at !== null],
			["review", "DELETED", true],
		);
		assert.equal(await balance(client), 0);
		await assert.rejects(confirm(client, "gone", "oliver"), /Deleted bank/);
	}));

test("Up import follows every page and safely reruns without posting money", async () =>
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
				await count(
					client,
					"SELECT count(*) n FROM bank_transactions WHERE decision='review' AND housemate_id='oliver'",
				),
				2,
			);
			assert.equal(await count(client, "SELECT count(*) n FROM receipts"), 0);
		} finally {
			globalThis.fetch = original;
		}
	}));

test("a reopened transfer keeps the housemate the admin chose through later re-ingests", async () =>
	fixture(async (client) => {
		const stranger = (amount: number) => {
			const bank = receipt("pay", amount, "house");
			bank.attributes.description = "J SMITH";
			bank.attributes.rawText = "J SMITH";
			return bank;
		};
		await ingest(client, stranger(6000));
		assert.equal((await bankRow(client, "pay")).decision, "excluded");
		await confirm(client, "pay", "oliver");
		await ingest(client, stranger(6100));
		await ingest(client, stranger(6100));
		const row = await bankRow(client, "pay");
		assert.deepEqual(
			[row.decision, row.housemate_id, row.decided_at !== null],
			["review", "oliver", true],
		);
		assert.match(String(row.reason), /changed/);
		assert.equal(await balance(client), 0);
	}));
