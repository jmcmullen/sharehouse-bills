import assert from "node:assert/strict";
import { test } from "node:test";
import type { Client } from "@libsql/client";
import { recordCashReceipt } from "../../payments/cash";
import { decideBankTransaction } from "../../payments/decisions";
import {
	addBill,
	addShares,
	confirm,
	day,
	fixture,
	ingest,
	receipt,
	revision,
	time,
} from "../../payments/tests/fixture";
import {
	loadAccount,
	loadAccounts,
	loadBill,
	loadBills,
	loadVoidedReceipts,
} from "../account.server";

function at(seconds: number) {
	return new Date(seconds * 1000).toISOString();
}

async function shareSettledAt(client: Client, debtId: string) {
	const bill = await loadBill("bill", { client });
	return bill?.shares.find((share) => share.id === debtId)?.settledAt ?? null;
}

async function bankPayment(
	client: Client,
	id: string,
	housemateId: string,
	amountCents: number,
	receivedAt: number,
	debtId: string,
) {
	const bank = receipt(id, amountCents, "Gas");
	bank.attributes.createdAt = at(receivedAt);
	bank.attributes.settledAt = at(receivedAt);
	await ingest(client, bank);
	await confirm(client, id, housemateId, [{ debtId, amountCents }]);
}

test("a bill settles when money for its last non-owner share arrived, by bank or cash date", async () =>
	fixture(async (client) => {
		await addShares(client, [
			["oliver-share", "oliver", "bill", 6000],
			["sarah-share", "sarah", "bill", 4000],
			["jay-share", "jay", "bill", 5000],
		]);
		await recordCashReceipt(client, {
			debtId: "sarah-share",
			amountCents: 2000,
			receivedAt: time + day,
		});
		await bankPayment(
			client,
			"oliver-bank",
			"oliver",
			6000,
			time + 2 * day,
			"oliver-share",
		);
		await recordCashReceipt(client, {
			debtId: "sarah-share",
			amountCents: 2000,
			receivedAt: time + 4 * day,
		});
		const bill = await loadBill("bill", { client });
		assert.equal(bill?.status, "paid");
		assert.equal(bill?.settledAt, time + 4 * day);
		assert.equal(await shareSettledAt(client, "oliver-share"), time + 2 * day);
		assert.equal(await shareSettledAt(client, "sarah-share"), time + 4 * day);
		assert.equal(await shareSettledAt(client, "jay-share"), null);
	}));

test("shares without allocations are unpaid and the bill has no settled date", async () =>
	fixture(async (client) => {
		await addShares(client, [
			["oliver-share", "oliver", "bill", 6000],
			["sarah-share", "sarah", "bill", 4000],
			["jay-share", "jay", "bill", 5000],
		]);
		const bill = await loadBill("bill", { client });
		assert.equal(bill?.status, "pending");
		assert.equal(bill?.settledAt, null);
		assert.deepEqual(
			bill?.shares.map((share) => [share.id, share.remainingCents]),
			[
				["jay-share", 5000],
				["oliver-share", 6000],
				["sarah-share", 4000],
			],
		);
		assert.equal(await loadBill("missing", { client }), null);
	}));

test("held credit covers the oldest share and every loader agrees", async () =>
	fixture(async (client) => {
		await addBill(client, {
			id: "later",
			name: "Water",
			dueAt: time + 10 * day,
		});
		await client.execute("UPDATE bills SET total_cents=8000 WHERE id='later'");
		await addShares(client, [
			["gas-share", "oliver", "bill", 6000],
			["water-share", "oliver", "later", 4000],
		]);
		await ingest(client, receipt("held", 7000));
		await confirm(client, "held", "oliver");
		const account = await loadAccount("oliver", { client, now: time });
		assert.ok(account);
		assert.deepEqual(
			account.shares.map((share) => [
				share.id,
				share.coveredCents,
				share.leftCents,
				share.overdue,
			]),
			[
				["gas-share", 6000, 0, false],
				["water-share", 1000, 3000, false],
			],
		);
		assert.equal(account.creditCents, 7000);
		assert.equal(account.owesCents, 3000);
		assert.equal(account.balanceCents, 3000);
		const all = await loadAccounts({ client, now: time });
		assert.deepEqual(
			all.map((item) => [item.housemate.id, item.owesCents]),
			[
				["jay", 0],
				["oliver", 3000],
				["sarah", 0],
			],
		);
		const bills = await loadBills({ client, now: time });
		assert.deepEqual(
			bills.map((bill) => [bill.id, bill.totalCents, bill.status]),
			[
				["later", 8000, "pending"],
				["bill", 0, "pending"],
			],
		);
		assert.equal(await loadAccount("nobody", { client }), null);
	}));

test("receipts carry their kind and transfer; voided receipts leave the account", async () =>
	fixture(async (client) => {
		await addShares(client, [["gas-share", "oliver", "bill", 6000]]);
		await bankPayment(client, "first", "oliver", 6000, time, "gas-share");
		const [live] = (await loadAccount("oliver", { client }))?.receipts ?? [];
		assert.deepEqual(
			[live.kind, live.bankTransactionId, live.description, live.voidedAt],
			["bank", "first", "Mr Oliver William Caprile · Gas", null],
		);
		await decideBankTransaction(client, {
			transactionId: "first",
			action: "exclude",
			reason: "Sent by mistake",
			expectedRevision: await revision(client, "first"),
		});
		const account = await loadAccount("oliver", { client });
		assert.deepEqual(account?.receipts, []);
		assert.equal(account?.shares[0].paidCents, 0);
		assert.equal(account?.balanceCents, 6000);
		const voided = await loadVoidedReceipts("oliver", { client });
		assert.deepEqual(
			voided.map((item) => [item.id, item.voidReason, item.allocations]),
			[[live.id, "Sent by mistake", []]],
		);
	}));
