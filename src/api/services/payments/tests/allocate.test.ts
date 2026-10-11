import assert from "node:assert/strict";
import { test } from "node:test";
import type { Client } from "@libsql/client";
import { loadAccount, loadBill } from "../../account/account.server";
import { getAccountPayments } from "../account-payments";
import { allocateReceipt } from "../allocate";
import { recordCashReceipt } from "../cash";
import {
	addBill,
	addShares,
	confirm,
	count,
	day,
	fixture,
	ingest,
	receipt,
	time,
} from "./fixture";

async function receiptId(client: Client, housemateId = "oliver") {
	return (await getAccountPayments(client, housemateId)).receipts[0].id;
}

async function reallocate(
	client: Client,
	allocations: Array<{ debtId: string; amountCents: number }>,
	housemateId = "oliver",
) {
	const account = await getAccountPayments(client, housemateId);
	await allocateReceipt(client, {
		housemateId,
		receiptId: account.receipts[0].id,
		allocations,
		expectedRevision: account.revision,
	});
}

test("allocations conserve money, reject stale edits and other housemates' bills, and leave excess as credit", async () =>
	fixture(async (client) => {
		await addShares(client, [
			["gas-share", "oliver", "bill", 6000],
			["sarah-gas", "sarah", "bill", 4000],
		]);
		await ingest(client, receipt("extra", 9000));
		await confirm(client, "extra", "oliver");
		const before = await getAccountPayments(client, "oliver");
		const input = {
			housemateId: "oliver",
			receiptId: before.receipts[0].id,
			allocations: [{ debtId: "gas-share", amountCents: 6000 }],
			expectedRevision: before.revision,
		};
		await allocateReceipt(client, input);
		const after = await getAccountPayments(client, "oliver");
		assert.equal(after.bills[0].remainingCents, 0);
		assert.equal(after.unallocatedCents, 3000);
		assert.equal(
			(await loadAccount("oliver", { client }))?.balanceCents,
			-3000,
		);
		await assert.rejects(allocateReceipt(client, input), /changed/);
		await assert.rejects(
			allocateReceipt(client, {
				...input,
				expectedRevision: after.revision,
				allocations: [{ debtId: "gas-share", amountCents: 10000 }],
			}),
			/exceed/,
		);
		await assert.rejects(
			allocateReceipt(client, {
				...input,
				expectedRevision: after.revision,
				allocations: [{ debtId: "sarah-gas", amountCents: 1000 }],
			}),
			/this housemate/,
		);
		await allocateReceipt(client, {
			...input,
			allocations: [],
			expectedRevision: after.revision,
		});
		assert.equal(
			(await getAccountPayments(client, "oliver")).unallocatedCents,
			9000,
		);
		assert.equal(
			await count(client, "SELECT sum(amount_cents) n FROM allocation_history"),
			0,
		);
		assert.equal(
			await count(
				client,
				"SELECT count(*) n FROM allocation_history WHERE amount_cents<0",
			),
			1,
		);
	}));

test("rent cannot silently pay utilities", async () =>
	fixture(async (client) => {
		await addShares(client, [["gas-share", "oliver", "bill", 6000]]);
		await ingest(client, receipt("rent", 12000, "Rent"));
		await confirm(client, "rent", "oliver");
		await assert.rejects(
			reallocate(client, [{ debtId: "gas-share", amountCents: 1 }]),
			/rent payment/,
		);
	}));

const shareState = async (client: Client, id: string) => {
	const bill = await loadBill("bill", { client });
	const share = bill?.shares.find((item) => item.id === id);
	return {
		bill: bill?.status,
		paid: share?.paidCents,
		settledAt: share?.settledAt,
	};
};

test("paid state follows allocations and the allocation that pays a bill queues one group message", async () =>
	fixture(async (client) => {
		await addShares(client, [
			["gas-share", "oliver", "bill", 6000],
			["sarah-gas", "sarah", "bill", 4000],
		]);
		await ingest(client, receipt("pay", 6000));
		await confirm(client, "pay", "oliver", [
			{ debtId: "gas-share", amountCents: 6000 },
		]);
		const paid = await shareState(client, "gas-share");
		assert.deepEqual(paid, {
			bill: "partially_paid",
			paid: 6000,
			settledAt: time,
		});
		assert.equal(
			await count(
				client,
				"SELECT count(*) n FROM whatsapp_notifications WHERE event_type='bill_paid'",
			),
			0,
			"a settled share alone sends no group message",
		);
		await recordCashReceipt(client, {
			debtId: "sarah-gas",
			amountCents: 4000,
			receivedAt: time,
		});
		assert.equal((await shareState(client, "sarah-gas")).bill, "paid");
		await reallocate(client, []);
		await reallocate(client, [{ debtId: "gas-share", amountCents: 6000 }]);
		assert.deepEqual(
			(
				await client.execute(
					"SELECT event_key,status,bill_id FROM whatsapp_notifications WHERE event_type='bill_paid'",
				)
			).rows.map((row) => [row.event_key, row.status, row.bill_id]),
			[["bill-paid:bill", "pending", "bill"]],
		);
		await reallocate(client, []);
		assert.deepEqual(await shareState(client, "gas-share"), {
			bill: "partially_paid",
			paid: 0,
			settledAt: null,
		});
	}));

test("reallocating sends a numbered correction only when the bills change", async () =>
	fixture(async (client) => {
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
		await ingest(client, receipt("paid", 9000));
		await confirm(client, "paid", "oliver");
		const id = await receiptId(client);
		const receiptRows = async () =>
			(
				await client.execute(
					"SELECT event_key,event_type,payload FROM whatsapp_notifications WHERE event_type IN ('payment_receipt','payment_correction') ORDER BY event_key",
				)
			).rows;
		assert.deepEqual(
			(await getAccountPayments(client, "oliver")).receipts[0].suggestion,
			{
				allocations: [
					{ debtId: "gas-share", amountCents: 6000 },
					{ debtId: "clean-share", amountCents: 3000 },
				],
				confidence: "combination",
				reason: "Exactly covers Gas · 29 May + Cleaners · 30 May",
			},
		);
		await reallocate(client, [{ debtId: "gas-share", amountCents: 6000 }]);
		await reallocate(client, [{ debtId: "gas-share", amountCents: 6000 }]);
		await reallocate(client, [
			{ debtId: "gas-share", amountCents: 6000 },
			{ debtId: "clean-share", amountCents: 3000 },
		]);
		await reallocate(client, []);
		const rows = await receiptRows();
		assert.deepEqual(
			rows.map((row) => row.event_key),
			[
				`payment-correction:${id}:1`,
				`payment-correction:${id}:2`,
				`payment-correction:${id}:3`,
				`payment-receipt:${id}`,
			],
		);
		const first = JSON.parse(String(rows[0].payload));
		assert.deepEqual(first.before, []);
		assert.deepEqual(first.after, [{ debtId: "gas-share", amountCents: 6000 }]);
		const held = JSON.parse(String(rows[2].payload));
		assert.equal(held.before.length, 2);
		assert.deepEqual(held.after, []);
		assert.equal(held.amountCents, 9000);
		assert.equal(held.receivedAt, time);
	}));
