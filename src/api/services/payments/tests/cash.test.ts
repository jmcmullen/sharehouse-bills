import assert from "node:assert/strict";
import { test } from "node:test";
import { loadBill } from "../../account/account.server";
import { getPaymentReceiptNotificationContext } from "../../whatsapp-payment-receipt";
import { getAccountPayments } from "../account-payments";
import { recordCashReceipt } from "../cash";
import {
	addBill,
	addShares,
	count,
	day,
	fixture,
	recordCash,
	time,
} from "./fixture";

const paymentMessages = (client: Parameters<typeof count>[0]) =>
	client.execute(
		"SELECT event_key,event_type,housemate_id FROM whatsapp_notifications WHERE event_type LIKE 'payment_%'",
	);

test("cash is one receipt allocated across shares with one housemate receipt", async () =>
	fixture(async (client) => {
		await addBill(client, { id: "water", name: "Water", dueAt: time - day });
		await addShares(client, [
			["gas-share", "oliver", "bill", 6000],
			["water-share", "oliver", "water", 4000],
		]);
		const { receiptId } = await recordCash(client, {
			housemateId: "oliver",
			amountCents: 8000,
			receivedAt: time,
			note: "Handed over at dinner",
			allocations: [
				{ debtId: "water-share", amountCents: 4000 },
				{ debtId: "gas-share", amountCents: 4000 },
			],
		});
		assert.equal(await count(client, "SELECT count(*) AS n FROM receipts"), 1);
		assert.deepEqual(
			(
				await client.execute(
					"SELECT r.id,r.kind,r.note,r.amount_cents,r.bank_transaction_id,a.debt_id,a.amount_cents AS allocated FROM receipts r JOIN allocations a ON a.receipt_id=r.id ORDER BY a.debt_id",
				)
			).rows.map((row) => [
				row.id,
				row.kind,
				row.note,
				Number(row.amount_cents),
				row.bank_transaction_id,
				row.debt_id,
				Number(row.allocated),
			]),
			[
				[
					receiptId,
					"cash",
					"Handed over at dinner",
					8000,
					null,
					"gas-share",
					4000,
				],
				[
					receiptId,
					"cash",
					"Handed over at dinner",
					8000,
					null,
					"water-share",
					4000,
				],
			],
		);
		assert.equal((await loadBill("water", { client }))?.status, "paid");
		const account = await getAccountPayments(client, "oliver");
		assert.equal(
			account.receipts[0].description,
			"Cash received · Handed over at dinner",
		);
		assert.equal(account.unallocatedCents, 0);
		assert.deepEqual(
			(await paymentMessages(client)).rows.map((row) => [
				row.event_key,
				row.event_type,
				row.housemate_id,
			]),
			[[`payment-receipt:${receiptId}`, "payment_receipt", "oliver"]],
		);
		const [message] = (
			await client.execute(
				"SELECT id FROM whatsapp_notifications WHERE event_type='payment_receipt'",
			)
		).rows;
		const context = await getPaymentReceiptNotificationContext(
			String(message.id),
			{ client },
		);
		assert.deepEqual(
			[context?.kind, context?.method, context?.creditCents],
			["receipt", "cash", 0],
		);
	}));

test("cash with no allocations is held as credit and still sends a receipt", async () =>
	fixture(async (client) => {
		await addShares(client, [["gas-share", "oliver", "bill", 6000]]);
		await recordCash(client, {
			housemateId: "oliver",
			amountCents: 2500,
			receivedAt: time,
			allocations: [],
		});
		const account = await getAccountPayments(client, "oliver");
		assert.equal(account.unallocatedCents, 2500);
		assert.equal(account.bills[0].remainingCents, 6000);
		assert.equal(
			await count(client, "SELECT count(*) AS n FROM allocations"),
			0,
		);
		assert.equal((await paymentMessages(client)).rows.length, 1);
	}));

test("cash rejects a stale revision, over-allocation, a future date and the owner", async () =>
	fixture(async (client) => {
		await addShares(client, [
			["gas-share", "oliver", "bill", 6000],
			["jay-share", "jay", "bill", 4000],
		]);
		const { revision } = await getAccountPayments(client, "oliver");
		const cash = (
			overrides: Partial<Parameters<typeof recordCashReceipt>[1]>,
		) =>
			recordCashReceipt(client, {
				housemateId: "oliver",
				amountCents: 3000,
				receivedAt: time,
				allocations: [{ debtId: "gas-share", amountCents: 3000 }],
				expectedRevision: revision,
				...overrides,
			});
		await assert.rejects(
			cash({ expectedRevision: "stale" }),
			/Payments or bills changed/,
		);
		await assert.rejects(
			cash({ allocations: [{ debtId: "gas-share", amountCents: 3001 }] }),
			/exceed the payment received/,
		);
		await assert.rejects(
			cash({
				amountCents: 7000,
				allocations: [{ debtId: "gas-share", amountCents: 7000 }],
			}),
			/exceeds the bill's remaining share/,
		);
		await assert.rejects(
			cash({ receivedAt: Math.floor(Date.now() / 1000) + day }),
			/future date/,
		);
		await assert.rejects(
			cash({ housemateId: "jay", allocations: [] }),
			/not found/,
		);
		await assert.rejects(
			cash({ allocations: [{ debtId: "jay-share", amountCents: 3000 }] }),
			/Select a bill/,
		);
		assert.equal(await count(client, "SELECT count(*) AS n FROM receipts"), 0);
		await cash({});
		await assert.rejects(cash({}), /Payments or bills changed/);
		assert.equal(await count(client, "SELECT count(*) AS n FROM receipts"), 1);
	}));

test("a note saying rent limits cash to rent bills", async () =>
	fixture(async (client) => {
		await addBill(client, {
			id: "rent",
			name: "Rent",
			dueAt: time,
			billType: "rent",
		});
		await addShares(client, [
			["gas-share", "oliver", "bill", 6000],
			["rent-share", "oliver", "rent", 30000],
		]);
		await assert.rejects(
			recordCash(client, {
				housemateId: "oliver",
				amountCents: 6000,
				receivedAt: time,
				note: "Rent for this week",
				allocations: [{ debtId: "gas-share", amountCents: 6000 }],
			}),
			/rent bills/,
		);
		await recordCash(client, {
			housemateId: "oliver",
			amountCents: 6000,
			receivedAt: time,
			note: "Rent for this week",
			allocations: [{ debtId: "rent-share", amountCents: 6000 }],
		});
		assert.equal(
			(await getAccountPayments(client, "oliver")).receipts[0].rentOnly,
			true,
		);
	}));
