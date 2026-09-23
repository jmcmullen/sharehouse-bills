import assert from "node:assert/strict";
import { test } from "node:test";
import {
	owingCents,
	reminderCredit,
	uncoveredShares,
} from "../bill-reminder-credit";

const rows = [
	{ id: "rent", housemateId: "oliver", amountOwed: 120, amountPaid: 0 },
	{ id: "gas", housemateId: "oliver", amountOwed: 60, amountPaid: 10 },
	{ id: "sarah-gas", housemateId: "sarah", amountOwed: 40, amountPaid: null },
];
const credit = (amountCents: number) =>
	new Map([["oliver", { amountCents, receivedAt: null }]]);
const ids = (shares: typeof rows) => shares.map((row) => row.id);

test("credit covers shares in order and only the uncovered ones are reminded", () => {
	assert.deepEqual(ids(uncoveredShares(rows, credit(12000))), [
		"gas",
		"sarah-gas",
	]);
	assert.deepEqual(ids(uncoveredShares(rows, credit(13000))), [
		"gas",
		"sarah-gas",
	]);
	assert.deepEqual(ids(uncoveredShares(rows, credit(17000))), ["sarah-gas"]);
	assert.deepEqual(ids(uncoveredShares(rows, new Map())), [
		"rent",
		"gas",
		"sarah-gas",
	]);
});

test("reminder credit names the applied part and what is left", () => {
	assert.equal(owingCents(rows), 21000);
	assert.equal(reminderCredit(null, 5000), null);
	assert.equal(
		reminderCredit({ amountCents: 0, receivedAt: null }, 5000),
		null,
	);
	assert.deepEqual(
		reminderCredit({ amountCents: 5000, receivedAt: 100 }, 12000),
		{
			creditCents: 5000,
			receivedAt: new Date(100000),
			toPayCents: 7000,
		},
	);
	assert.deepEqual(
		reminderCredit({ amountCents: 20000, receivedAt: null }, 12000),
		{
			creditCents: 12000,
			receivedAt: null,
			toPayCents: 0,
		},
	);
});
