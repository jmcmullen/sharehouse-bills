import assert from "node:assert/strict";
import { test } from "node:test";
import type { Client } from "@libsql/client";
import { getAccountPayments } from "../account-payments";
import { allocateReceipt } from "../allocation-actions";
import { recordCashReceipt } from "../cash-receipt";
import { drainLedgerEvents } from "../events";
import { reviewBankTransaction } from "../review-decisions";
import { getBillSettledAt, getDebtSettledAt } from "../settled-at.server";
import { applySource, withWriteTransaction } from "../sources";
import { fixture, ingest, receipt, time } from "./fixture";

const day = 86_400;

function at(seconds: number) {
	return new Date(seconds * 1000);
}

async function shares(client: Client) {
	await client.execute(
		`INSERT INTO debts(id,housemate_id,bill_id,amount_owed,amount_paid,created_at) VALUES('oliver-share','oliver','bill',60,0,${time}),('sarah-share','sarah','bill',40,0,${time}),('jay-share','jay','bill',50,0,${time})`,
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
		assert.deepEqual(
			await getBillSettledAt(client, "bill"),
			at(time + 4 * day),
		);
		assert.deepEqual(
			await getDebtSettledAt(client, "oliver-share"),
			at(time + 2 * day),
		);
		assert.deepEqual(
			await getDebtSettledAt(client, "sarah-share"),
			at(time + 4 * day),
		);
		assert.equal(await getDebtSettledAt(client, "jay-share"), null);
	}));

test("a recorded payment confirmed by a transfer counts from the bank's received date", async () =>
	fixture(async (client) => {
		await client.executeMultiple(`
			INSERT INTO debts(id,housemate_id,bill_id,amount_owed,amount_paid,created_at) VALUES('gas-share','oliver','bill',60,60,${time});
			INSERT INTO payment_transactions(id,transaction_id,housemate_id,amount,status,source,description,created_at,matched_debt_ids)
			VALUES('m-gas','m-gas','oliver',60,'matched','manual_admin','Manual gas',${time + 90 * day},'["gas-share"]');
		`);
		await drainLedgerEvents(client);
		assert.deepEqual(
			await getBillSettledAt(client, "bill"),
			at(time + 90 * day),
		);
		const bank = receipt("combined", 6000, "Gas");
		await ingest(client, bank);
		await reviewBankTransaction(client, {
			transactionId: bank.id,
			action: "link",
			housemateId: "oliver",
			manualSourceKeys: ["manual:m-gas"],
			reason: "Same money",
		});
		assert.deepEqual(await getBillSettledAt(client, "bill"), at(time));
	}));

test("a paid bill without ledger allocations falls back to the shares' paid dates", async () =>
	fixture(async (client) => {
		assert.equal(await getBillSettledAt(client, "bill"), null);
		await client.execute(
			`INSERT INTO debts(id,housemate_id,bill_id,amount_owed,amount_paid,created_at,is_paid,paid_at) VALUES('oliver-share','oliver','bill',60,60,${time},1,${time + 5}),('sarah-share','sarah','bill',40,40,${time},1,${time + 3}),('jay-share','jay','bill',50,50,${time},1,${time + 99})`,
		);
		assert.deepEqual(await getBillSettledAt(client, "bill"), at(time + 5));
	}));
