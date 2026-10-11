import assert from "node:assert/strict";
import { test } from "node:test";
import { loadBill } from "../../account/account.server";
import { getAccountPayments } from "../account-payments";
import { recordCashReceipt } from "../cash";
import { addShares, fixture, time } from "./fixture";

test("cash received settles the share and sends one housemate receipt", async () =>
	fixture(async (client) => {
		await addShares(client, [["gas-share", "oliver", "bill", 6000]]);
		const { receiptId } = await recordCashReceipt(client, {
			debtId: "gas-share",
			amountCents: 6000,
			receivedAt: time,
			note: "Handed over at dinner",
		});
		const bill = await loadBill("bill", { client });
		assert.equal(bill?.shares[0].paidCents, 6000);
		assert.equal(bill?.shares[0].remainingCents, 0);
		assert.equal(bill?.status, "paid");
		assert.deepEqual(
			(
				await client.execute(
					"SELECT r.id,r.kind,r.note,r.bank_transaction_id,a.debt_id,a.amount_cents FROM receipts r JOIN allocations a ON a.receipt_id=r.id",
				)
			).rows.map((row) => [
				row.id,
				row.kind,
				row.note,
				row.bank_transaction_id,
				row.debt_id,
				Number(row.amount_cents),
			]),
			[[receiptId, "cash", "Handed over at dinner", null, "gas-share", 6000]],
		);
		const account = await getAccountPayments(client, "oliver");
		assert.equal(account.receipts[0].kind, "cash");
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
		await addShares(client, [
			["gas-share", "oliver", "bill", 6000],
			["jay-share", "jay", "bill", 4000],
		]);
		const cash = (debtId: string, amountCents: number, receivedAt = time) =>
			recordCashReceipt(client, { debtId, amountCents, receivedAt });
		await assert.rejects(
			cash("gas-share", 6001),
			/exceeds the remaining share/,
		);
		await assert.rejects(
			cash("gas-share", 100, Math.floor(Date.now() / 1000) + 86400),
			/future date/,
		);
		await assert.rejects(cash("jay-share", 100), /not found/);
		await assert.rejects(cash("nope", 100), /not found/);
		await cash("gas-share", 2500);
		await cash("gas-share", 3500);
		const account = await getAccountPayments(client, "oliver");
		assert.equal(account.bills[0].remainingCents, 0);
		assert.equal(account.receipts.length, 2);
	}));
