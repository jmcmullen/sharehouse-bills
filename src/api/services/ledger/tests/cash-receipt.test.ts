import assert from "node:assert/strict";
import { test } from "node:test";
import { getAccountPayments } from "../account-payments";
import { recordCashReceipt } from "../cash-receipt";
import { drainLedgerEvents } from "../events";
import { fixture, time } from "./fixture";

test("cash received settles the share, marks the receipt reviewed and sends one housemate receipt", async () =>
	fixture(async (client) => {
		await client.execute(
			`INSERT INTO debts(id,housemate_id,bill_id,amount_owed,amount_paid,created_at) VALUES('gas-share','oliver','bill',60,0,${time})`,
		);
		await drainLedgerEvents(client);
		const { receiptId } = await recordCashReceipt(client, {
			debtId: "gas-share",
			amountCents: 6000,
			receivedAt: time,
			note: "Handed over at dinner",
		});
		assert.match(receiptId, /^manual:cash-/);
		const paid = (
			await client.execute(
				"SELECT amount_paid,is_paid FROM debts WHERE id='gas-share'",
			)
		).rows[0];
		assert.equal(paid.amount_paid, 60);
		assert.equal(paid.is_paid, 1);
		assert.equal(
			(await client.execute("SELECT status FROM bills WHERE id='bill'")).rows[0]
				.status,
			"paid",
		);
		assert.deepEqual(
			(
				await client.execute(
					"SELECT source_key,debt_id,amount_cents,origin FROM ledger_bill_allocations",
				)
			).rows.map((row) => [
				row.source_key,
				row.debt_id,
				Number(row.amount_cents),
				row.origin,
			]),
			[[receiptId, "gas-share", 6000, "review"]],
		);
		assert.equal(
			(
				await client.execute({
					sql: "SELECT count(*) AS n FROM ledger_allocation_reviews WHERE source_key=?",
					args: [receiptId],
				})
			).rows[0].n,
			1,
		);
		const account = await getAccountPayments(client, "oliver");
		assert.equal(account.receipts.length, 1);
		assert.equal(account.receipts[0].manual, true);
		assert.equal(
			account.receipts[0].description,
			"Cash received · Handed over at dinner",
		);
		assert.equal(account.unallocatedCents, 0);
		assert.deepEqual(
			(
				await client.execute(
					"SELECT event_key,event_type,housemate_id FROM whatsapp_notifications WHERE event_type LIKE 'payment_%'",
				)
			).rows.map((row) => [row.event_key, row.event_type, row.housemate_id]),
			[[`payment-receipt:${receiptId}`, "payment_receipt", "oliver"]],
		);
	}));

test("cash cannot exceed the remaining share, be dated in the future, or land on the owner or a missing share", async () =>
	fixture(async (client) => {
		await client.execute(
			`INSERT INTO debts(id,housemate_id,bill_id,amount_owed,amount_paid,created_at) VALUES('gas-share','oliver','bill',60,0,${time}),('jay-share','jay','bill',40,0,${time})`,
		);
		await drainLedgerEvents(client);
		await assert.rejects(
			recordCashReceipt(client, {
				debtId: "gas-share",
				amountCents: 6001,
				receivedAt: time,
			}),
			/exceeds the remaining share/,
		);
		await assert.rejects(
			recordCashReceipt(client, {
				debtId: "gas-share",
				amountCents: 100,
				receivedAt: Math.floor(Date.now() / 1000) + 86400,
			}),
			/future date/,
		);
		await assert.rejects(
			recordCashReceipt(client, {
				debtId: "jay-share",
				amountCents: 100,
				receivedAt: time,
			}),
			/not found/,
		);
		await assert.rejects(
			recordCashReceipt(client, {
				debtId: "nope",
				amountCents: 100,
				receivedAt: time,
			}),
			/not found/,
		);
		await recordCashReceipt(client, {
			debtId: "gas-share",
			amountCents: 2500,
			receivedAt: time,
		});
		await recordCashReceipt(client, {
			debtId: "gas-share",
			amountCents: 3500,
			receivedAt: time,
		});
		const account = await getAccountPayments(client, "oliver");
		assert.equal(account.bills[0].remainingCents, 0);
		assert.equal(account.receipts.length, 2);
	}));
