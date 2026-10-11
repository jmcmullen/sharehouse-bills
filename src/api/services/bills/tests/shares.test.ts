import assert from "node:assert/strict";
import { test } from "node:test";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../../../db/schema";
import { count, fixture, time } from "../../payments/tests/fixture";
import { insertBillWithShares } from "../shares";

const values = {
	billerName: "Internet",
	totalCents: 9000,
	dueDate: new Date(time * 1000),
};

test("a new bill commits only together with its shares", async () =>
	fixture(async (client) => {
		const database = drizzle({ client, schema });
		await assert.rejects(
			insertBillWithShares(values, [], database),
			/at least one share/,
		);
		assert.equal(
			await count(
				client,
				"SELECT count(*) n FROM bills WHERE biller_name='Internet'",
			),
			0,
			"no bill is left without shares",
		);
		const bill = await insertBillWithShares(
			values,
			[
				{ housemateId: "oliver", amountCents: 4500 },
				{ housemateId: "sarah", amountCents: 4500 },
			],
			database,
		);
		assert.equal(
			await count(
				client,
				`SELECT count(*) n FROM debts WHERE bill_id='${bill.id}'`,
			),
			2,
		);
	}));
