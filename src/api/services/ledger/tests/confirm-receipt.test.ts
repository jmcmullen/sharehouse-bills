import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import type { Client } from "@libsql/client";
import { getAccountPayments } from "../account-payments";
import { confirmReceipt } from "../confirm-receipt";
import { drainLedgerEvents } from "../events";
import { isRentReference } from "../model";
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
import { fixture, ingest, manual, receipt, time } from "./fixture";

const bankRow = async (client: Client, id: string) =>
	(
		await client.execute({
			sql: "SELECT decision,decision_origin,reason,review_group,updated_at FROM ledger_bank_transactions WHERE id=?",
			args: [id],
		})
	).rows[0];
const revision = async (client: Client, id: string) =>
	Number((await bankRow(client, id)).updated_at);
const count = async (client: Client, sql: string) =>
	Number((await client.execute(sql)).rows[0].n);

async function openShares(client: Client): Promise<void> {
	await client.executeMultiple(
		`INSERT INTO bills(id,biller_name,due_date,created_at,bill_type) VALUES('cleaning','Cleaners',${time + 86400},${time - 1000},'cleaning');
		INSERT INTO debts(id,housemate_id,bill_id,amount_owed,amount_paid,created_at) VALUES('gas-share','oliver','bill',60,0,${time}),('clean-share','oliver','cleaning',30,0,${time});`,
	);
	await drainLedgerEvents(client);
}

test("an identified housemate receipt is always reviewed, never credited, whatever the reference says", async () =>
	fixture(async (client) => {
		for (const [index, message] of ["Gas", "RENT", "", "Dinner"].entries())
			await ingest(client, receipt(`ref-${index}`, 3000, message));
		assert.equal(
			await count(
				client,
				"SELECT count(*) n FROM ledger_bank_transactions WHERE decision='review' AND review_group='unclear'",
			),
			4,
		);
		assert.equal((await getAccountStatement(client, "oliver")).balanceCents, 0);
		assert.match(
			String((await bankRow(client, "ref-0")).reason),
			/confirm the bills/,
		);
		const personal = receipt("personal", 3000, "Rent");
		personal.attributes.description = "Personal contact";
		personal.attributes.rawText = "PERSONAL CONTACT";
		await ingest(client, personal);
		assert.equal((await bankRow(client, "personal")).decision, "exclude");
	}));

test("migration 0018 remaps stored groups and queues automatic credits for review", async () =>
	fixture(async (client) => {
		await ingest(client, receipt("auto", 3000, "Gas"));
		await client.execute(
			"UPDATE ledger_bank_transactions SET decision='credit',review_group='purpose' WHERE id='auto'",
		);
		await withWriteTransaction(client, (tx) =>
			applySource(tx, "bank:auto", {
				housemateId: "oliver",
				amountCents: -3000,
				kind: "payment",
				description: "Gas",
				billId: null,
				effectiveAt: time,
				dueAt: null,
			}),
		);
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			-3000,
		);
		await ingest(client, receipt("kept", 2000, "Gas"));
		await withWriteTransaction(client, async (tx) => {
			await applySource(tx, "bank:kept", {
				housemateId: "oliver",
				amountCents: -2000,
				kind: "payment",
				description: "Gas",
				billId: null,
				effectiveAt: time,
				dueAt: null,
			});
			await tx.execute(
				"INSERT INTO ledger_allocation_reviews(source_key,reviewed_at) VALUES('bank:kept',1)",
			);
		});
		await client.execute(
			"UPDATE ledger_bank_transactions SET decision='credit',review_group='duplicate' WHERE id='kept'",
		);
		await ingest(client, receipt("shared", 7600, "Oliver + Sarah"));
		await client.execute(
			"UPDATE ledger_bank_transactions SET review_group='assignment' WHERE id='shared'",
		);
		await client.executeMultiple(
			await readFile(
				new URL(
					"../../../db/migrations/0018_review_groups.sql",
					import.meta.url,
				),
				"utf8",
			),
		);
		assert.equal((await bankRow(client, "auto")).review_group, "unclear");
		assert.equal((await bankRow(client, "kept")).review_group, "unclear");
		assert.equal((await bankRow(client, "shared")).review_group, "shared");
		assert.equal((await bankRow(client, "kept")).decision_origin, "review");
		assert.equal(await drainLedgerEvents(client), 1);
		assert.equal((await bankRow(client, "auto")).decision, "review");
		assert.equal((await bankRow(client, "kept")).decision, "credit");
		await ingest(client, receipt("kept", 2000, "Gas"));
		assert.equal((await bankRow(client, "kept")).decision, "credit");
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			-2000,
		);
	}));

test("a rent reference confirms onto a template-generated rent bill with no bill type", async () =>
	fixture(async (client) => {
		await client.executeMultiple(
			`INSERT INTO recurringBills(id,templateName,billerName) VALUES('weekly','Weekly Rent','Agent');
		INSERT INTO bills(id,biller_name,due_date,created_at,recurring_bill_id) VALUES('rent','Agent',${time + 86400},${time - 1000},'weekly');
		INSERT INTO debts(id,housemate_id,bill_id,amount_owed,amount_paid,created_at) VALUES('rent-share','oliver','rent',420,0,${time});`,
		);
		await drainLedgerEvents(client);
		await ingest(client, receipt("rent", 42000, "Rent"));
		await confirmReceipt(client, {
			transactionId: "rent",
			housemateId: "oliver",
			allocations: [{ debtId: "rent-share", amountCents: 42000 }],
			expectedRevision: await revision(client, "rent"),
		});
		const bill = (await getAccountPayments(client, "oliver")).bills.find(
			(item) => item.id === "rent-share",
		);
		assert.equal(bill?.category, "Weekly Rent");
		assert.equal(bill?.paidCents, 42000);
	}));

test("a rent reference pays rent only unless it names a utility too", () => {
	assert.equal(isRentReference("Rent"), true);
	assert.equal(isRentReference("rent for May"), true);
	assert.equal(isRentReference("Rent + pool and water"), false);
	assert.equal(isRentReference("Rental"), false);
	assert.equal(isRentReference("Bills"), false);
});

test("review groups derive from the live suggestion and filter by it", async () =>
	fixture(async (client) => {
		await openShares(client);
		await ingest(client, receipt("exact", 6000, ""));
		await ingest(client, receipt("part", 7000, ""));
		await ingest(client, receipt("shared", 9000, "Oliver + Sarah"));
		await ingest(client, receipt("out", -500, ""));
		const all = await loadPaymentReview(client, {});
		const group = (id: string) => all.reviews.find((row) => row.id === id);
		assert.equal(group("exact")?.group, "suggested");
		assert.equal(group("exact")?.suggestion?.confidence, "exact");
		assert.equal(group("part")?.group, "unclear");
		assert.equal(group("part")?.suggestion?.confidence, "partial");
		assert.equal(group("shared")?.group, "shared");
		assert.equal(group("shared")?.suggestion, null);
		assert.equal(group("out")?.group, "outgoing");
		const suggested = await loadPaymentReview(client, { group: "suggested" });
		assert.deepEqual(
			suggested.reviews.map((row) => row.id),
			["exact"],
		);
		assert.equal(suggested.reviewCount, 1);
		assert.equal(
			(await loadPaymentReview(client, { group: "unclear" })).reviews[0].id,
			"part",
		);
		assert.equal(
			all.accounts.find((a) => a.id === "oliver")?.billing.unpaidCents,
			9000,
		);
	}));

test("confirming writes credit, allocations, the review and the receipt in one transaction", async () =>
	fixture(async (client) => {
		await openShares(client);
		await ingest(client, receipt("pay", 9000, ""));
		const stale = await revision(client, "pay");
		const input = {
			transactionId: "pay",
			housemateId: "oliver",
			allocations: [
				{ debtId: "gas-share", amountCents: 6000 },
				{ debtId: "clean-share", amountCents: 3000 },
			],
			expectedRevision: stale,
		};
		await assert.rejects(
			confirmReceipt(client, {
				...input,
				allocations: [{ debtId: "gas-share", amountCents: 6100 }],
			}),
			/remaining share/,
		);
		await assert.rejects(
			confirmReceipt(client, {
				...input,
				allocations: [{ debtId: "gas-share", amountCents: 9001 }],
			}),
			/exceed/,
		);
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			9000,
		);
		assert.equal((await bankRow(client, "pay")).decision, "review");
		assert.equal(
			await count(client, "SELECT count(*) n FROM whatsapp_notifications"),
			0,
		);
		await confirmReceipt(client, input);
		await assert.rejects(confirmReceipt(client, input), /changed since/);
		const bank = await bankRow(client, "pay");
		assert.equal(bank.decision, "credit");
		assert.equal(bank.decision_origin, "review");
		assert.equal((await getAccountStatement(client, "oliver")).balanceCents, 0);
		const account = await getAccountPayments(client, "oliver");
		assert.equal(account.unpaidCents, 0);
		assert.equal(account.unallocatedCents, 0);
		assert.deepEqual(
			(
				await client.execute(
					"SELECT debt_id,amount_cents,origin FROM ledger_bill_allocations ORDER BY debt_id",
				)
			).rows.map((row) => [row.debt_id, Number(row.amount_cents), row.origin]),
			[
				["clean-share", 3000, "review"],
				["gas-share", 6000, "review"],
			],
		);
		assert.equal(
			await count(
				client,
				"SELECT count(*) n FROM ledger_allocation_reviews WHERE source_key='bank:pay'",
			),
			1,
		);
		const notification = (
			await client.execute(
				"SELECT event_key,housemate_id,payload FROM whatsapp_notifications WHERE event_type='payment_receipt'",
			)
		).rows[0];
		assert.equal(notification.event_key, "payment-receipt:bank:pay");
		assert.equal(notification.housemate_id, "oliver");
		assert.equal(JSON.parse(String(notification.payload)).after.length, 2);
		assert.equal((await loadPaymentReview(client, {})).reviewCount, 0);
	}));

test("keeping money as credit records an explicit empty review and a receipt saying so", async () =>
	fixture(async (client) => {
		await openShares(client);
		await ingest(client, receipt("held", 5000, ""));
		await confirmReceipt(client, {
			transactionId: "held",
			housemateId: "oliver",
			allocations: [],
			expectedRevision: await revision(client, "held"),
		});
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			4000,
		);
		assert.equal(
			await count(
				client,
				"SELECT count(*) n FROM ledger_allocation_reviews WHERE source_key='bank:held'",
			),
			1,
		);
		assert.equal(
			await count(client, "SELECT count(*) n FROM ledger_bill_allocations"),
			0,
		);
		const payload = JSON.parse(
			String(
				(
					await client.execute(
						"SELECT payload FROM whatsapp_notifications WHERE event_key='payment-receipt:bank:held'",
					)
				).rows[0].payload,
			),
		);
		assert.deepEqual(payload.after, []);
		assert.equal(payload.amountCents, 5000);
		assert.equal(
			(await getAccountPayments(client, "oliver")).receipts[0].unallocatedCents,
			5000,
		);
	}));

test("a possible manual duplicate needs a note before it is confirmed as separate money", async () =>
	fixture(async (client) => {
		await manual(client, 60);
		await openShares(client);
		await ingest(client, receipt("dup", 6000, ""));
		const review = await loadPaymentReview(client, {});
		assert.equal(review.reviews[0].matchCandidate, true);
		assert.equal(review.reviews[0].group, "suggested");
		const input = {
			transactionId: "dup",
			housemateId: "oliver",
			allocations: [{ debtId: "gas-share", amountCents: 6000 }],
			expectedRevision: await revision(client, "dup"),
		};
		await assert.rejects(confirmReceipt(client, input), /Match the recorded/);
		await confirmReceipt(client, { ...input, reason: "Second gas payment" });
		assert.equal((await bankRow(client, "dup")).reason, "Second gas payment");
	}));

test("batch confirmation accepts only exact suggestions and is atomic", async () =>
	fixture(async (client) => {
		await openShares(client);
		await ingest(client, receipt("exact", 6000, ""));
		await ingest(client, receipt("combo", 9000, ""));
		await ingest(client, receipt("none", 6000, "Oliver + Sarah"));
		const item = async (transactionId: string) => ({
			transactionId,
			action: "confirm" as const,
			expectedRevision: await revision(client, transactionId),
		});
		await assert.rejects(
			reviewBankTransactions(client, [
				await item("exact"),
				await item("combo"),
			]),
			/exactly match/,
		);
		await assert.rejects(
			reviewBankTransactions(client, [await item("none")]),
			/Choose the housemate/,
		);
		assert.equal((await bankRow(client, "exact")).decision, "review");
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			9000,
		);
		await reviewBankTransactions(client, [
			await item("exact"),
			{
				transactionId: "combo",
				action: "exclude",
				reason: "",
				expectedRevision: await revision(client, "combo"),
			},
		]);
		assert.equal((await bankRow(client, "exact")).decision, "credit");
		assert.equal((await bankRow(client, "combo")).decision, "exclude");
		assert.equal(
			(await getAccountStatement(client, "oliver")).balanceCents,
			3000,
		);
		assert.equal(
			(await getAccountPayments(client, "oliver")).bills.find(
				(bill) => bill.id === "gas-share",
			)?.remainingCents,
			0,
		);
		await assert.rejects(
			reviewBankTransaction(client, {
				transactionId: "exact",
				action: "credit",
				housemateId: "oliver",
				reason: "",
				expectedRevision: 0,
			}),
			/changed since/,
		);
	}));
