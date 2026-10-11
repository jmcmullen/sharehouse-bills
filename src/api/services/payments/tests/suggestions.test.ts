import assert from "node:assert/strict";
import { test } from "node:test";
import { fillOldestFirst, suggestAllocations } from "../suggestions";

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

test("an exact single match wins and the oldest open share breaks ties", () => {
	const result = suggestAllocations({
		amountCents: 5000,
		receivedAt: received,
		rentOnly: false,
		shares: [
			share("newer", 5000, received + day),
			share("older", 5000, received - 30 * day),
			share("pair-a", 2500),
			share("pair-b", 2500),
		],
	});
	assert.deepEqual(result?.allocations, [
		{ debtId: "older", amountCents: 5000 },
	]);
	assert.equal(result?.confidence, "exact");
	assert.match(result?.reason ?? "", /^Exactly matches Gas · \d+ \w+$/);
});

test("a weekly rent payment settles the oldest open week, not this week's", () => {
	const weeks = [-27, -20, -13, -6, 1].map((offset) =>
		share(`week${offset}`, 38800, received + offset * day, "Rent", "Rent"),
	);
	const result = suggestAllocations({
		amountCents: 38800,
		receivedAt: received,
		rentOnly: true,
		shares: weeks,
	});
	assert.deepEqual(result?.allocations, [
		{ debtId: "week-27", amountCents: 38800 },
	]);
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

test("partial suggestions cover the oldest shares first and leave excess unallocated", () => {
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

test("fillOldestFirst covers the oldest shares first and stops at the amount", () => {
	assert.deepEqual(
		fillOldestFirst(
			[
				share("undated", 1000, null),
				share("new", 3000, received),
				share("old", 2000, received - 2 * day),
				share("paid", 0, received - 3 * day),
				share("mid", 4000, received - day),
			],
			7500,
		),
		[
			{ debtId: "old", amountCents: 2000 },
			{ debtId: "mid", amountCents: 4000 },
			{ debtId: "new", amountCents: 1500 },
		],
	);
});

test("fillOldestFirst reaches undated shares last and allocates nothing beyond the open total", () => {
	const shares = [share("undated", 1000, null), share("dated", 2000)];
	assert.deepEqual(fillOldestFirst(shares, 5000), [
		{ debtId: "dated", amountCents: 2000 },
		{ debtId: "undated", amountCents: 1000 },
	]);
	assert.deepEqual(fillOldestFirst(shares, 0), []);
	assert.deepEqual(fillOldestFirst([], 5000), []);
});
