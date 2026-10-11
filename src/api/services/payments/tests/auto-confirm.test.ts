import assert from "node:assert/strict";
import { test } from "node:test";
import type { Client } from "@libsql/client";
import { isHouseholdReference } from "../model";
import {
	addBill,
	addShares,
	count,
	day,
	fixture,
	ingest,
	receipt,
	receive,
	time,
} from "./fixture";

const bankRow = async (client: Client, id: string) =>
	(
		await client.execute({
			sql: "SELECT decision,decided_at,housemate_id,reason FROM bank_transactions WHERE id=?",
			args: [id],
		})
	).rows[0];
const messages = (client: Client, type: string) =>
	count(
		client,
		`SELECT count(*) n FROM whatsapp_notifications WHERE event_type='${type}'`,
	);

async function rentAndGas(client: Client): Promise<void> {
	await addBill(client, {
		id: "rent",
		name: "Agent",
		dueAt: time + day,
		billType: "rent",
	});
	await addShares(client, [
		["gas-share", "oliver", "bill", 6000],
		["rent-share", "oliver", "rent", 42000],
	]);
}

test("a household reference is bills or rent with at most a date or short qualifier", () => {
	for (const [text, expected] of [
		["Bills", true],
		["bills", true],
		["Bill", true],
		["Rent", true],
		["RENT", true],
		["Rent 12 Sep", true],
		["rent + bills", true],
		["Bills - Oli", true],
		["  bills  ", true],
		["Inv7773", false],
		["Savings", false],
		["dinner", false],
		["", false],
		["billing", false],
		["Rental", false],
		["Gas", false],
		["Bills and the rest of what I owe you for the Bali trip", false],
	] as const)
		assert.equal(isHouseholdReference(text), expected, JSON.stringify(text));
});

test("an exact Bills transfer confirms itself with its receipt, allocation and the housemate's receipt", async () =>
	fixture(async (client) => {
		await rentAndGas(client);
		await receive(client, receipt("pay", 6000, "Bills"));
		const row = await bankRow(client, "pay");
		assert.equal(row.decision, "confirmed");
		assert.notEqual(row.decided_at, null);
		assert.equal(row.housemate_id, "oliver");
		assert.equal(
			row.reason,
			"Confirmed automatically: exact match for Gas · 29 May",
		);
		const receipts = (
			await client.execute(
				"SELECT housemate_id,amount_cents,kind,note,bank_transaction_id FROM receipts WHERE voided_at IS NULL",
			)
		).rows;
		assert.deepEqual(
			receipts.map((item) => [
				item.housemate_id,
				Number(item.amount_cents),
				item.kind,
				item.note,
				item.bank_transaction_id,
			]),
			[["oliver", 6000, "bank", "", "pay"]],
		);
		assert.deepEqual(
			(
				await client.execute("SELECT debt_id,amount_cents FROM allocations")
			).rows.map((item) => [item.debt_id, Number(item.amount_cents)]),
			[["gas-share", 6000]],
		);
		assert.equal(await messages(client, "payment_receipt"), 1);
		assert.equal(await messages(client, "payment_arrived"), 0);
	}));

test("a Rent transfer only exact-matches a rent share", async () =>
	fixture(async (client) => {
		await rentAndGas(client);
		await receive(client, receipt("rent", 42000, "Rent 12 Sep"));
		assert.equal((await bankRow(client, "rent")).decision, "confirmed");
		assert.deepEqual(
			(await client.execute("SELECT debt_id FROM allocations")).rows.map(
				(item) => item.debt_id,
			),
			["rent-share"],
		);
		await receive(client, receipt("gas", 6000, "Rent"));
		const gas = await bankRow(client, "gas");
		assert.deepEqual([gas.decision, gas.decided_at], ["review", null]);
		assert.equal(await messages(client, "payment_arrived"), 1);
		assert.equal(await count(client, "SELECT count(*) n FROM receipts"), 1);
	}));

test("combination matches and non-household references stay in review", async () =>
	fixture(async (client) => {
		await rentAndGas(client);
		await receive(client, receipt("combo", 48000, "Bills"));
		await receive(client, receipt("invoice", 6000, "Inv7773"));
		await receive(client, receipt("blank", 6000, ""));
		for (const id of ["combo", "invoice", "blank"]) {
			const row = await bankRow(client, id);
			assert.deepEqual([row.decision, row.decided_at], ["review", null], id);
		}
		assert.equal(await count(client, "SELECT count(*) n FROM receipts"), 0);
		assert.equal(await messages(client, "payment_arrived"), 3);
		assert.equal(await messages(client, "payment_receipt"), 0);
	}));

test("a held exact transfer waits silently and confirms itself once settled", async () =>
	fixture(async (client) => {
		await rentAndGas(client);
		const bank = receipt("held", 6000, "bills");
		bank.attributes.status = "HELD";
		bank.attributes.settledAt = null;
		await receive(client, bank);
		const held = await bankRow(client, "held");
		assert.deepEqual([held.decision, held.decided_at], ["review", null]);
		assert.equal(await messages(client, "payment_arrived"), 0);
		assert.equal(await count(client, "SELECT count(*) n FROM receipts"), 0);
		bank.attributes.status = "SETTLED";
		bank.attributes.settledAt = new Date(time * 1000).toISOString();
		await receive(client, bank);
		assert.equal((await bankRow(client, "held")).decision, "confirmed");
		assert.equal(await messages(client, "payment_arrived"), 0);
		assert.equal(await messages(client, "payment_receipt"), 1);
	}));

test("a held transfer that still needs a decision tells the owner only once settled", async () =>
	fixture(async (client) => {
		const bank = receipt("held", 6000, "IOU");
		bank.attributes.status = "HELD";
		bank.attributes.settledAt = null;
		await receive(client, bank);
		assert.equal(await messages(client, "payment_arrived"), 0);
		bank.attributes.status = "SETTLED";
		await receive(client, bank);
		await receive(client, bank);
		assert.equal(await messages(client, "payment_arrived"), 1);
	}));

test("an admin-decided row is never auto-confirmed by a later ingest or import", async () =>
	fixture(async (client) => {
		await ingest(client, receipt("decided", 6000, "Bills"));
		await client.execute(
			"UPDATE bank_transactions SET decision='excluded',reason='Not ours',decided_at=1 WHERE id='decided'",
		);
		await rentAndGas(client);
		await ingest(client, receipt("decided", 6000, "Bills"));
		const row = await bankRow(client, "decided");
		assert.deepEqual(
			[row.decision, row.reason, Number(row.decided_at)],
			["excluded", "Not ours", 1],
		);
		assert.equal(await count(client, "SELECT count(*) n FROM receipts"), 0);
		assert.equal(
			await count(client, "SELECT count(*) n FROM whatsapp_notifications"),
			0,
		);
	}));

test("re-ingesting an auto-confirmed transfer keeps it, and a changed amount reopens it", async () =>
	fixture(async (client) => {
		await rentAndGas(client);
		const bank = receipt("pay", 6000, "Bills");
		await receive(client, bank);
		const before = await bankRow(client, "pay");
		await receive(client, bank);
		const after = await bankRow(client, "pay");
		assert.deepEqual(
			[after.decision, after.decided_at],
			["confirmed", before.decided_at],
		);
		assert.equal(await count(client, "SELECT count(*) n FROM receipts"), 1);
		bank.attributes.amount.valueInBaseUnits = 6100;
		await receive(client, bank);
		const reopened = await bankRow(client, "pay");
		assert.equal(reopened.decision, "review");
		assert.notEqual(reopened.decided_at, null);
		assert.equal(
			await count(
				client,
				"SELECT count(*) n FROM receipts WHERE voided_at IS NULL",
			),
			0,
		);
	}));
