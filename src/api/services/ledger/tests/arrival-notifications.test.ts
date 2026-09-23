import assert from "node:assert/strict";
import { test } from "node:test";
import type { Client } from "@libsql/client";
import { enqueuePaymentArrived } from "../arrival-notifications";
import { withWriteTransaction } from "../sources";
import { fixture, ingest, receipt } from "./fixture";

const rows = (client: Client) =>
	client.execute(
		"SELECT event_key,event_type,status,housemate_id,payload FROM whatsapp_notifications WHERE event_type='payment_arrived' ORDER BY event_key",
	);
const arrive = (client: Client, id: string) =>
	withWriteTransaction(client, (tx) => enqueuePaymentArrived(tx, id));

test("a payment waiting for review tells the owner once, and re-ingests stay silent", async () =>
	fixture(async (client) => {
		const unclear = receipt("bank-review", 19900, "IOU");
		await ingest(client, unclear);
		assert.equal(await arrive(client, "bank-review"), true);
		await ingest(client, unclear);
		assert.equal(await arrive(client, "bank-review"), false);
		const pending = (await rows(client)).rows;
		assert.equal(pending.length, 1);
		assert.equal(pending[0].event_key, "payment-arrived:bank-review");
		assert.equal(pending[0].status, "pending");
		assert.equal(pending[0].housemate_id, "jay");
		assert.deepEqual(JSON.parse(String(pending[0].payload)), {
			source: "ledger",
			transactionId: "bank-review",
			housemateId: "oliver",
			sharedWith: [],
		});
	}));

test("shared payments name every housemate and personal activity never notifies", async () =>
	fixture(async (client) => {
		await ingest(
			client,
			receipt("bank-shared", 30000, "Oliver and Sarah rent"),
		);
		assert.equal(await arrive(client, "bank-shared"), true);
		const personal = receipt("bank-personal", 5000, "Dinner");
		await ingest(client, {
			...personal,
			attributes: {
				...personal.attributes,
				description: "Somebody Else",
				rawText: "SOMEBODY ELSE",
			},
		});
		assert.equal(await arrive(client, "bank-personal"), false);
		assert.equal(await arrive(client, "missing"), false);
		const pending = (await rows(client)).rows;
		assert.deepEqual(
			pending.map((row) => [
				row.event_key,
				JSON.parse(String(row.payload)).sharedWith,
			]),
			[["payment-arrived:bank-shared", ["oliver", "sarah"]]],
		);
	}));
