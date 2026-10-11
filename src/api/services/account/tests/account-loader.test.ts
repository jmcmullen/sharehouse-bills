import assert from "node:assert/strict";
import { test } from "node:test";
import type { Client } from "@libsql/client";
import { getAccountPayments } from "../../ledger/account-payments";
import { allocateReceipt } from "../../ledger/allocation-actions";
import { recordCashReceipt } from "../../ledger/cash-receipt";
import { drainLedgerEvents } from "../../ledger/events";
import { reviewBankTransaction } from "../../ledger/review-decisions";
import { applySource, withWriteTransaction } from "../../ledger/sources";
import {
	fixture,
	ingest,
	manual,
	receipt,
	time,
} from "../../ledger/tests/fixture";
import {
	loadAccount,
	loadAccounts,
	loadBill,
	loadBills,
} from "../account.server";

const day = 86_400;

function at(seconds: number) {
	return new Date(seconds * 1000);
}

async function billSettledAt(client: Client, billId: string) {
	return (await loadBill(billId, { client }))?.settledAt ?? null;
}

async function shareSettledAt(client: Client, debtId: string) {
	const bill = await loadBill("bill", { client });
	return bill?.shares.find((share) => share.id === debtId)?.settledAt ?? null;
}

async function shares(client: Client) {
	await client.execute(
		`INSERT INTO debts(id,housemate_id,bill_id,amount_cents,created_at) VALUES('oliver-share','oliver','bill',6000,${time}),('sarah-share','sarah','bill',4000,${time}),('jay-share','jay','bill',5000,${time})`,
	);
	await drainLedgerEvents(client);
}

async function bankPayment(client: Client, receivedAt: number) {
	const bank = receipt("oliver-bank", 6000, "Gas");
	bank.attributes.createdAt = at(receivedAt).toISOString();
	bank.attributes.settledAt = at(receivedAt).toISOString();
	await ingest(client, bank);
	await reviewBankTransaction(client, {
		transactionId: bank.id,
		action: "credit",
		housemateId: "oliver",
		reason: "",
	});
	const account = await getAccountPayments(client, "oliver");
	const paid = account.bills.find((bill) => bill.id === "oliver-share");
	if (paid?.remainingCents === 0) return;
	await allocateReceipt(client, {
		housemateId: "oliver",
		receiptId: "bank:oliver-bank",
		allocations: [{ debtId: "oliver-share", amountCents: 6000 }],
		expectedRevision: account.revision,
	});
}

async function ownerPayment(client: Client, receivedAt: number) {
	await withWriteTransaction(client, async (tx) => {
		await applySource(tx, "manual:owner", {
			housemateId: "jay",
			kind: "payment",
			amountCents: -5000,
			description: "Owner share",
			billId: null,
			effectiveAt: receivedAt,
			dueAt: null,
		});
		await tx.execute(
			"INSERT INTO ledger_bill_allocations(source_key,debt_id,amount_cents,origin) VALUES('manual:owner','jay-share',5000,'review')",
		);
	});
}

test("a bill settles when money for its last non-owner share arrived, by bank or cash date", async () =>
	fixture(async (client) => {
		await shares(client);
		await recordCashReceipt(client, {
			debtId: "sarah-share",
			amountCents: 2000,
			receivedAt: time + day,
		});
		await bankPayment(client, time + 2 * day);
		await recordCashReceipt(client, {
			debtId: "sarah-share",
			amountCents: 2000,
			receivedAt: time + 4 * day,
		});
		await ownerPayment(client, time + 9 * day);
		assert.equal(await billSettledAt(client, "bill"), time + 4 * day);
		assert.equal(await shareSettledAt(client, "oliver-share"), time + 2 * day);
		assert.equal(await shareSettledAt(client, "sarah-share"), time + 4 * day);
		assert.equal(await shareSettledAt(client, "jay-share"), time + 9 * day);
		assert.equal((await loadBill("bill", { client }))?.status, "paid");
	}));

test("a recorded payment confirmed by a transfer counts from the bank's received date", async () =>
	fixture(async (client) => {
		await client.execute(
			`INSERT INTO debts(id,housemate_id,bill_id,amount_cents,created_at) VALUES('gas-share','oliver','bill',6000,${time})`,
		);
		await drainLedgerEvents(client);
		await manual(client, {
			amountCents: 6000,
			key: "manual:m-gas",
			description: "Manual gas",
			effectiveAt: time + 90 * day,
			debtId: "gas-share",
		});
		assert.equal(await billSettledAt(client, "bill"), time + 90 * day);
		const bank = receipt("combined", 6000, "Gas");
		await ingest(client, bank);
		await reviewBankTransaction(client, {
			transactionId: bank.id,
			action: "link",
			housemateId: "oliver",
			manualSourceKeys: ["manual:m-gas"],
			reason: "Same money",
		});
		assert.equal(await billSettledAt(client, "bill"), time);
	}));

test("shares without allocations are unpaid and the bill has no settled date", async () =>
	fixture(async (client) => {
		assert.equal(await billSettledAt(client, "bill"), null);
		await shares(client);
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
		await client.executeMultiple(
			`INSERT INTO bills(id,biller_name,total_cents,due_date,created_at) VALUES('later','Water',8000,${time + 10 * day},${time});
			INSERT INTO debts(id,housemate_id,bill_id,amount_cents,created_at) VALUES('gas-share','oliver','bill',6000,${time}),('water-share','oliver','later',4000,${time})`,
		);
		await drainLedgerEvents(client);
		await manual(client, { amountCents: 7000, key: "manual:held" });
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
