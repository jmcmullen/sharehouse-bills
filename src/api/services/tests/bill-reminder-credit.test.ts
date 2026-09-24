import assert from "node:assert/strict";
import { test } from "node:test";
import {
	coverShares,
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

test("each share knows how much credit it took and what is left", () => {
	const cover = (amountCents: number) =>
		coverShares(rows, credit(amountCents)).map((row) => [
			row.id,
			row.coveredCents,
			row.leftCents,
		]);
	assert.deepEqual(cover(13000), [
		["rent", 12000, 0],
		["gas", 1000, 4000],
		["sarah-gas", 0, 4000],
	]);
	assert.deepEqual(cover(297600), [
		["rent", 12000, 0],
		["gas", 5000, 0],
		["sarah-gas", 0, 4000],
	]);
	assert.deepEqual(cover(0), [
		["rent", 0, 12000],
		["gas", 0, 5000],
		["sarah-gas", 0, 4000],
	]);
	assert.deepEqual(rows[0], {
		id: "rent",
		housemateId: "oliver",
		amountOwed: 120,
		amountPaid: 0,
	});
});

test("reminder credit sums the cover of the shares it names", () => {
	assert.equal(owingCents(rows), 21000);
	const gas = coverShares(rows, credit(13000)).filter(
		(row) => row.id === "gas",
	);
	assert.equal(reminderCredit(null, gas), null);
	assert.equal(reminderCredit({ amountCents: 0, receivedAt: null }, gas), null);
	assert.deepEqual(
		reminderCredit({ amountCents: 13000, receivedAt: 100 }, gas),
		{
			creditCents: 1000,
			receivedAt: new Date(100000),
			toPayCents: 4000,
		},
	);
	const covered = coverShares(rows, credit(20000)).filter(
		(row) => row.housemateId === "oliver",
	);
	assert.deepEqual(
		reminderCredit({ amountCents: 20000, receivedAt: null }, covered),
		{ creditCents: 17000, receivedAt: null, toPayCents: 0 },
	);
	// Credit spent on older bills says nothing about this one.
	const sarah = coverShares(rows, credit(12000)).filter(
		(row) => row.id === "sarah-gas",
	);
	assert.equal(
		reminderCredit({ amountCents: 12000, receivedAt: null }, sarah),
		null,
	);
});
