import assert from "node:assert/strict";
import { test } from "node:test";
import type { Client } from "@libsql/client";
import { loadAccount } from "../../account/account.server";
import { getPaymentReceiptNotificationContext } from "../../whatsapp-payment-receipt";
import { getAccountPayments } from "../account-payments";
import { decideBankTransaction, decideBankTransactions } from "../decisions";
import { isRentReference } from "../model";
import { loadPaymentReview } from "../review-data";
import {
	addBill,
	addShares,
	confirm,
	count,
	day,
	fixture,
	ingest,
	receipt,
	revision,
	time,
} from "./fixture";

const bankRow = async (client: Client, id: string) =>
	(
		await client.execute({
			sql: "SELECT decision,decided_at,housemate_id,reason FROM bank_transactions WHERE id=?",
			args: [id],
		})
	).rows[0];
const balance = async (client: Client, id = "oliver") =>
	(await loadAccount(id, { client }))?.balanceCents;
const liveReceipts = (client: Client) =>
	client.execute(
		"SELECT housemate_id,amount_cents,kind,bank_transaction_id,note FROM receipts WHERE voided_at IS NULL ORDER BY housemate_id",
	);

async function openShares(client: Client): Promise<void> {
	await addBill(client, {
		id: "cleaning",
		name: "Cleaners",
		dueAt: time + day,
		billType: "cleaning",
	});
	await addShares(client, [
		["gas-share", "oliver", "bill", 6000],
		["clean-share", "oliver", "cleaning", 3000],
	]);
}

test("confirming writes the receipt, its allocations, the decision and the housemate's receipt in one transaction", async () =>
	fixture(async (client) => {
		await openShares(client);
		await ingest(client, receipt("pay", 9000, ""));
		const input = {
			transactionId: "pay",
			action: "confirm" as const,
			housemateId: "oliver",
			allocations: [
				{ debtId: "gas-share", amountCents: 6000 },
				{ debtId: "clean-share", amountCents: 3000 },
			],
			expectedRevision: await revision(client, "pay"),
		};
		await assert.rejects(
			decideBankTransaction(client, {
				...input,
				allocations: [{ debtId: "gas-share", amountCents: 6100 }],
			}),
			/remaining share/,
		);
		await assert.rejects(
			decideBankTransaction(client, {
				...input,
				allocations: [{ debtId: "gas-share", amountCents: 9001 }],
			}),
			/exceed/,
		);
		assert.equal(await count(client, "SELECT count(*) n FROM receipts"), 0);
		assert.equal((await bankRow(client, "pay")).decision, "review");
		assert.equal(
			await count(client, "SELECT count(*) n FROM whatsapp_notifications"),
			0,
		);
		await decideBankTransaction(client, input);
		await assert.rejects(decideBankTransaction(client, input), /changed since/);
		const bank = await bankRow(client, "pay");
		assert.equal(bank.decision, "confirmed");
		assert.notEqual(bank.decided_at, null);
		assert.equal(await balance(client), 0);
		const [stored] = (await liveReceipts(client)).rows;
		assert.deepEqual(
			[stored.amount_cents, stored.kind, stored.bank_transaction_id],
			[9000, "bank", "pay"],
		);
		assert.deepEqual(
			(
				await client.execute(
					"SELECT debt_id,amount_cents FROM allocations ORDER BY debt_id",
				)
			).rows.map((row) => [row.debt_id, Number(row.amount_cents)]),
			[
				["clean-share", 3000],
				["gas-share", 6000],
			],
		);
		const account = await getAccountPayments(client, "oliver");
		assert.equal(account.unpaidCents, 0);
		assert.equal(account.unallocatedCents, 0);
		const notification = (
			await client.execute(
				"SELECT event_key,housemate_id,payload FROM whatsapp_notifications WHERE event_type='payment_receipt'",
			)
		).rows[0];
		assert.equal(
			notification.event_key,
			`payment-receipt:${account.receipts[0].id}`,
		);
		assert.equal(notification.housemate_id, "oliver");
		assert.equal(JSON.parse(String(notification.payload)).after.length, 2);
		assert.equal((await loadPaymentReview(client, {})).reviewCount, 0);
	}));

test("keeping money as credit confirms an empty allocation and a receipt saying so", async () =>
	fixture(async (client) => {
		await openShares(client);
		await ingest(client, receipt("held", 5000, ""));
		await confirm(client, "held", "oliver");
		assert.equal(await balance(client), 4000);
		assert.equal(await count(client, "SELECT count(*) n FROM allocations"), 0);
		const payload = JSON.parse(
			String(
				(
					await client.execute(
						"SELECT payload FROM whatsapp_notifications WHERE event_type='payment_receipt'",
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

test("reassigning a transfer voids the first receipt and excluding voids the second", async () =>
	fixture(async (client) => {
		await ingest(client, receipt("bank-1", 2000, ""));
		await confirm(
			client,
			"bank-1",
			"oliver",
			[],
			"Confirmed household payment",
		);
		await confirm(client, "bank-1", "sarah");
		assert.equal(await balance(client), 0);
		assert.equal(await balance(client, "sarah"), -2000);
		await decideBankTransaction(client, {
			transactionId: "bank-1",
			action: "exclude",
			reason: "Previously accounted rent",
			expectedRevision: await revision(client, "bank-1"),
		});
		assert.equal(await balance(client, "sarah"), 0);
		assert.equal((await bankRow(client, "bank-1")).decision, "excluded");
		assert.deepEqual(
			(
				await client.execute(
					"SELECT housemate_id,void_reason FROM receipts ORDER BY recorded_at,housemate_id",
				)
			).rows.map((row) => [row.housemate_id, row.void_reason]),
			[
				["oliver", "Replaced by a new decision"],
				["sarah", "Previously accounted rent"],
			],
		);
	}));

test("pending, foreign-currency, deleted and owner decisions are refused", async () =>
	fixture(async (client) => {
		const pending = receipt("pending");
		pending.attributes.status = "HELD";
		pending.attributes.settledAt = null;
		await ingest(client, pending);
		await assert.rejects(confirm(client, "pending", "oliver"), /settled/);
		const foreign = receipt("foreign");
		foreign.attributes.amount.currencyCode = "USD";
		await ingest(client, foreign);
		await assert.rejects(confirm(client, "foreign", "oliver"), /settled/);
		await ingest(client, receipt("deleted", 3000, ""));
		await client.execute(
			"UPDATE bank_transactions SET bank_status='DELETED' WHERE id='deleted'",
		);
		await assert.rejects(confirm(client, "deleted", "oliver"), /Deleted bank/);
		await ingest(client);
		await assert.rejects(confirm(client, "bank-1", "jay"), /non-owner/);
		assert.equal(await count(client, "SELECT count(*) n FROM receipts"), 0);
	}));

test("a refund is a negative receipt that needs a note", async () =>
	fixture(async (client) => {
		await ingest(client, receipt("refund", -5000, "Refund"));
		const input = {
			transactionId: "refund",
			action: "refund" as const,
			housemateId: "oliver",
			expectedRevision: await revision(client, "refund"),
		};
		await assert.rejects(decideBankTransaction(client, input), /note/);
		await assert.rejects(confirm(client, "refund", "oliver"), /money received/);
		await decideBankTransaction(client, {
			...input,
			reason: "Bond returned to Oliver",
		});
		assert.equal(await balance(client), 5000);
		assert.deepEqual(
			(await liveReceipts(client)).rows.map((row) => [
				row.amount_cents,
				row.note,
			]),
			[[-5000, "Bond returned to Oliver"]],
		);
	}));

test("an archived transfer needs a note before it is confirmed", async () =>
	fixture(async (client) => {
		const old = receipt("old", 3000, "Gas");
		old.attributes.settledAt = new Date((time - 10000) * 1000).toISOString();
		await ingest(client, old);
		await assert.rejects(confirm(client, "old", "oliver"), /historical/);
		await confirm(client, "old", "oliver", [], "Gas from before the app");
		assert.equal(await balance(client), -3000);
	}));

test("split receipts conserve cents, can be corrected and void when the bank changes", async () =>
	fixture(async (client) => {
		const bank = receipt("split", 76000, "Oliver + Sarah");
		await ingest(client, bank);
		const split = async (allocations: Array<[string, number]>) =>
			decideBankTransaction(client, {
				transactionId: "split",
				action: "split",
				allocations: allocations.map(([housemateId, amountCents]) => ({
					housemateId,
					amountCents,
				})),
				expectedRevision: await revision(client, "split"),
			});
		await assert.rejects(
			split([
				["oliver", 40000],
				["sarah", 35000],
			]),
			/equal the payment/,
		);
		await assert.rejects(
			split([
				["oliver", 40000],
				["oliver", 36000],
			]),
			/only once/,
		);
		await assert.rejects(
			split([
				["oliver", 40000],
				["jay", 36000],
			]),
			/non-owner/,
		);
		await split([
			["oliver", 40000],
			["sarah", 36000],
		]);
		await ingest(client, bank);
		assert.equal(await balance(client), -40000);
		assert.equal(await balance(client, "sarah"), -36000);
		const review = await loadPaymentReview(client, { status: "confirmed" });
		assert.deepEqual(review.reviews[0].allocations, [
			{ housemateId: "oliver", amountCents: 40000 },
			{ housemateId: "sarah", amountCents: 36000 },
		]);
		await split([
			["oliver", 38000],
			["sarah", 38000],
		]);
		assert.equal(await balance(client), -38000);
		assert.equal(
			await count(
				client,
				"SELECT count(*) n FROM receipts WHERE voided_at IS NULL",
			),
			2,
		);
		bank.attributes.amount.valueInBaseUnits = 75000;
		await ingest(client, bank);
		assert.equal(await balance(client), 0);
		assert.equal(await balance(client, "sarah"), 0);
		assert.equal((await bankRow(client, "split")).decision, "review");
	}));

test("batch decisions are atomic, reject stale or repeated rows and accept only exact suggestions", async () =>
	fixture(async (client) => {
		await openShares(client);
		await ingest(client, receipt("exact", 6000, ""));
		await ingest(client, receipt("combo", 9000, ""));
		await ingest(client, receipt("none", 6000, "Oliver + Sarah"));
		const suggested = async (transactionId: string) => ({
			transactionId,
			action: "suggested" as const,
			expectedRevision: await revision(client, transactionId),
		});
		const exclude = async (transactionId: string) => ({
			transactionId,
			action: "exclude" as const,
			expectedRevision: await revision(client, transactionId),
		});
		await assert.rejects(
			decideBankTransactions(client, [
				await suggested("exact"),
				await suggested("combo"),
			]),
			/exactly match/,
		);
		await assert.rejects(
			decideBankTransactions(client, [await suggested("none")]),
			/Choose the housemate/,
		);
		await assert.rejects(
			decideBankTransactions(client, [
				await exclude("combo"),
				await exclude("combo"),
			]),
			/only once/,
		);
		await assert.rejects(
			decideBankTransactions(client, [
				await suggested("exact"),
				{ ...(await exclude("combo")), expectedRevision: 0 },
			]),
			/changed since/,
		);
		assert.equal((await bankRow(client, "exact")).decision, "review");
		assert.equal(await count(client, "SELECT count(*) n FROM receipts"), 0);
		await decideBankTransactions(client, [
			await suggested("exact"),
			await exclude("combo"),
		]);
		assert.equal((await bankRow(client, "exact")).decision, "confirmed");
		assert.equal((await bankRow(client, "combo")).decision, "excluded");
		assert.equal(await balance(client), 3000);
		assert.equal(
			(await getAccountPayments(client, "oliver")).bills.find(
				(bill) => bill.id === "gas-share",
			)?.remainingCents,
			0,
		);
	}));

test("a rent reference confirms onto a template-generated rent bill with no bill type", async () =>
	fixture(async (client) => {
		await client.execute(
			`INSERT INTO recurringBills(id,templateName,billerName,totalCents,frequency,startDate,createdAt,updatedAt) VALUES('weekly','Weekly Rent','Agent',0,'weekly',${time},${time},${time})`,
		);
		await addBill(client, {
			id: "rent",
			name: "Agent",
			dueAt: time + day,
			recurringBillId: "weekly",
		});
		await addShares(client, [["rent-share", "oliver", "rent", 42000]]);
		await ingest(client, receipt("rent", 42000, "Rent"));
		await confirm(client, "rent", "oliver", [
			{ debtId: "rent-share", amountCents: 42000 },
		]);
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

const receiptMessages = async (client: Client) =>
	(
		await client.execute(
			"SELECT id,event_type,status,payload FROM whatsapp_notifications WHERE event_type IN ('payment_receipt','payment_correction') ORDER BY json_extract(payload,'$.sequence')",
		)
	).rows.map((row) => ({
		id: String(row.id),
		type: String(row.event_type),
		status: String(row.status),
		payload: JSON.parse(String(row.payload)),
	}));

test("re-confirming a transfer for the same housemate keeps its receipt and sends a correction, never a second receipt", async () =>
	fixture(async (client) => {
		await addShares(client, [["gas-o", "oliver", "bill", 6000]]);
		await ingest(client, receipt("pay", 6000, "gas"));
		await confirm(client, "pay", "oliver", [], "First look");
		const [first] = (await liveReceipts(client)).rows;
		await confirm(
			client,
			"pay",
			"oliver",
			[{ debtId: "gas-o", amountCents: 6000 }],
			"It was the gas",
		);
		await confirm(client, "pay", "oliver", [
			{ debtId: "gas-o", amountCents: 6000 },
		]);
		const receipts = (
			await client.execute("SELECT id,voided_at,note FROM receipts")
		).rows;
		assert.equal(receipts.length, 1, "the receipt is kept, not replaced");
		assert.equal(receipts[0].voided_at, null);
		assert.equal(receipts[0].note, "");
		assert.equal(first.note, "First look");
		assert.deepEqual(
			(await receiptMessages(client)).map((item) => [
				item.type,
				item.payload.before,
				item.payload.after,
			]),
			[
				["payment_receipt", [], []],
				["payment_correction", [], [{ debtId: "gas-o", amountCents: 6000 }]],
			],
			"unchanged allocations send nothing",
		);
		assert.equal((await loadAccount("oliver", { client }))?.balanceCents, 0);
	}));

test("excluding a confirmed transfer withdraws its unsent receipt and tells the housemate the money no longer counts", async () =>
	fixture(async (client) => {
		await addShares(client, [["gas-o", "oliver", "bill", 6000]]);
		await ingest(client, receipt("pay", 6000, "gas"));
		await confirm(client, "pay", "oliver", [
			{ debtId: "gas-o", amountCents: 6000 },
		]);
		await decideBankTransaction(client, {
			transactionId: "pay",
			action: "exclude",
			reason: "Not ours",
			expectedRevision: await revision(client, "pay"),
		});
		const messages = await receiptMessages(client);
		assert.deepEqual(
			messages.map((item) => [
				item.type,
				item.payload.before,
				item.payload.after,
				item.payload.voided,
			]),
			[
				[
					"payment_receipt",
					[],
					[{ debtId: "gas-o", amountCents: 6000 }],
					false,
				],
				[
					"payment_correction",
					[{ debtId: "gas-o", amountCents: 6000 }],
					[],
					true,
				],
			],
		);
		const [sent, correction] = messages;
		assert.equal(
			await getPaymentReceiptNotificationContext(sent.id, { client }),
			null,
			"a pending receipt for voided money is not sent",
		);
		const context = await getPaymentReceiptNotificationContext(correction.id, {
			client,
		});
		assert.deepEqual(
			[context?.kind, context?.voided, context?.after],
			["correction", true, []],
		);
		assert.equal(
			(await loadAccount("oliver", { client }))?.shares[0].paidCents,
			0,
		);
	}));
