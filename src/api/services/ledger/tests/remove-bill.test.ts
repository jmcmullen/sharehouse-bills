import assert from "node:assert/strict";
import { test } from "node:test";
import { getAccountPayments } from "../account-payments";
import { recordCashReceipt } from "../cash-receipt";
import { drainLedgerEvents } from "../events";
import { removeBill } from "../remove-bill";
import { fixture, time } from "./fixture";

test("a deleted bill releases the money allocated to it back to credit once settled", async () =>
	fixture(async (client) => {
		await client.execute(
			`INSERT INTO debts(id,housemate_id,bill_id,amount_owed,amount_paid,created_at) VALUES('gas-share','oliver','bill',60,0,${time})`,
		);
		await drainLedgerEvents(client);
		await recordCashReceipt(client, {
			debtId: "gas-share",
			amountCents: 6000,
			receivedAt: time,
		});
		assert.equal(
			(await getAccountPayments(client, "oliver")).unallocatedCents,
			0,
		);

		await removeBill(client, "bill");
		await drainLedgerEvents(client);

		const account = await getAccountPayments(client, "oliver");
		assert.equal(account.unallocatedCents, 6000);
		assert.deepEqual(account.bills, []);
		assert.equal(
			(
				await client.execute(
					"SELECT count(*) AS n FROM ledger_bill_allocations",
				)
			).rows[0].n,
			0,
		);
		assert.equal(
			(await client.execute("SELECT count(*) AS n FROM bills")).rows[0].n,
			0,
		);
	}));
