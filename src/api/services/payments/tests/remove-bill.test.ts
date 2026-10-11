import assert from "node:assert/strict";
import { test } from "node:test";
import { getAccountPayments } from "../account-payments";
import { recordCashReceipt } from "../cash";
import { removeBill } from "../remove-bill";
import { approveBill } from "../verification";
import { addShares, count, fixture, time } from "./fixture";

test("a deleted bill releases the money allocated to it back to credit", async () =>
	fixture(async (client) => {
		await addShares(client, [["gas-share", "oliver", "bill", 6000]]);
		const { receiptId } = await recordCashReceipt(client, {
			debtId: "gas-share",
			amountCents: 6000,
			receivedAt: time,
		});
		await approveBill(client, "bill", true);
		assert.equal(
			(await getAccountPayments(client, "oliver")).unallocatedCents,
			0,
		);

		await removeBill(client, "bill");

		const account = await getAccountPayments(client, "oliver");
		assert.equal(account.unallocatedCents, 6000);
		assert.deepEqual(account.bills, []);
		assert.equal(await count(client, "SELECT count(*) n FROM allocations"), 0);
		assert.deepEqual(
			(
				await client.execute(
					"SELECT receipt_id,debt_id,amount_cents FROM allocation_history ORDER BY id",
				)
			).rows.map((row) => [row.receipt_id, row.debt_id, row.amount_cents]),
			[
				[receiptId, "gas-share", 6000],
				[receiptId, "gas-share", -6000],
			],
		);
		assert.equal(await count(client, "SELECT count(*) n FROM bills"), 0);
		assert.equal(await count(client, "SELECT count(*) n FROM bill_reviews"), 0);
	}));
