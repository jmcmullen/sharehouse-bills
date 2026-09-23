import assert from "node:assert/strict";
import { test } from "node:test";
import { suggestAllocations } from "../suggestions";

const day = 86400;
const received = 1780000000;
const share = (
	debtId: string,
	remainingCents: number,
	dueAt: number | null = received,
	category = "gas",
	billName = "Gas",
) => ({ debtId, billName, category, dueAt, remainingCents });

test("returns null without open shares or money", () => {
	assert.equal(
		suggestAllocations({
			amountCents: 100,
			receivedAt: received,
			rentOnly: false,
			shares: [share("a", 0)],
		}),
		null,
	);
	assert.equal(
		suggestAllocations({
			amountCents: 0,
			receivedAt: received,
			rentOnly: false,
			shares: [share("a", 100)],
		}),
		null,
	);
});

test("an exact single match wins and the nearest due date breaks ties", () => {
	const result = suggestAllocations({
		amountCents: 5000,
		receivedAt: received,
		rentOnly: false,
		shares: [
			share("far", 5000, received + 30 * day, "water", "Water"),
			share("near", 5000, received - 2 * day),
			share("pair-a", 2500),
			share("pair-b", 2500),
		],
	});
	assert.deepEqual(result?.allocations, [
		{ debtId: "near", amountCents: 5000 },
	]);
	assert.equal(result?.confidence, "exact");
	assert.match(result?.reason ?? "", /^Exactly matches Gas · \d+ \w+$/);
});

test("a combination of up to three shares prefers fewer shares", () => {
	const shares = [
		share("a", 1000, received + day),
		share("b", 2000, received + 2 * day),
		share("c", 3000, received + 3 * day),
		share("d", 7000, received + 40 * day, "water", "Water"),
	];
	const two = suggestAllocations({
		amountCents: 8000,
		receivedAt: received,
		rentOnly: false,
		shares,
	});
	assert.equal(two?.confidence, "combination");
	assert.deepEqual(
		two?.allocations.map((item) => item.debtId),
		["a", "d"],
	);
	const three = suggestAllocations({
		amountCents: 6000,
		receivedAt: received,
		rentOnly: false,
		shares,
	});
	assert.equal(three?.confidence, "combination");
	assert.deepEqual(
		three?.allocations.map((item) => item.debtId),
		["a", "b", "c"],
	);
	assert.match(three?.reason ?? "", /^Exactly covers Gas .* \+ Gas .* \+ Gas/);
	assert.equal(
		suggestAllocations({
			amountCents: 11500,
			receivedAt: received,
			rentOnly: false,
			shares,
		})?.confidence,
		"partial",
	);
});

test("partial suggestions cover nearest-due shares first and leave excess unallocated", () => {
	const shares = [
		share("later", 4000, received + 10 * day),
		share("soon", 3000, received + day),
		share("undated", 1500, null),
	];
	const short = suggestAllocations({
		amountCents: 5000,
		receivedAt: received,
		rentOnly: false,
		shares,
	});
	assert.equal(short?.confidence, "partial");
	assert.deepEqual(short?.allocations, [
		{ debtId: "soon", amountCents: 3000 },
		{ debtId: "later", amountCents: 2000 },
	]);
	assert.match(short?.reason ?? "", /part-pays Gas/);
	const excess = suggestAllocations({
		amountCents: 9000,
		receivedAt: received,
		rentOnly: false,
		shares,
	});
	assert.equal(
		excess?.allocations.reduce((sum, item) => sum + item.amountCents, 0),
		8500,
	);
	assert.match(excess?.reason ?? "", /\$5\.00 left unallocated/);
});

test("rent-only payments ignore utility shares", () => {
	const shares = [
		share("gas", 5000),
		share("rent", 5000, received + day, "Rent", "Rent"),
	];
	assert.deepEqual(
		suggestAllocations({
			amountCents: 5000,
			receivedAt: received,
			rentOnly: true,
			shares,
		})?.allocations,
		[{ debtId: "rent", amountCents: 5000 }],
	);
	assert.equal(
		suggestAllocations({
			amountCents: 100,
			receivedAt: received,
			rentOnly: true,
			shares: [share("gas", 5000)],
		}),
		null,
	);
});
