import assert from "node:assert/strict";
import { test } from "node:test";
import {
	distributeCents,
	getEqualSplitCents,
	splitEqually,
} from "../equal-split";

test("cents spread evenly with the remainder on the first people", () => {
	const cases: Array<[number, number, number[]]> = [
		[1000, 3, [334, 333, 333]],
		[999, 3, [333, 333, 333]],
		[5, 0, []],
		[-50, 2, [0, 0]],
	];
	for (const [total, count, expected] of cases)
		assert.deepEqual(distributeCents(total, count), expected);
});

test("housemates round up when an owner takes part and the owner absorbs the rest", () => {
	const cases = [
		{
			input: { totalCents: 10000, participantCount: 3, ownerCount: 1 },
			expected: {
				perDebtorCents: 3334,
				ownerShareCents: 3332,
				ownerShares: [3332],
			},
		},
		{
			input: { totalCents: 10001, participantCount: 3, ownerCount: 0 },
			expected: { perDebtorCents: 3334, ownerShareCents: -1, ownerShares: [] },
		},
		{
			input: { totalCents: 189000, participantCount: 4, ownerCount: 2 },
			expected: {
				perDebtorCents: 47250,
				ownerShareCents: 94500,
				ownerShares: [47250, 47250],
			},
		},
		{
			input: { totalCents: 500, participantCount: 0, ownerCount: 0 },
			expected: { perDebtorCents: 0, ownerShareCents: 0, ownerShares: [] },
		},
	];
	for (const { input, expected } of cases)
		assert.deepEqual(getEqualSplitCents(input), expected);
});

test("an equal split gives every non-owner the same whole cents", () => {
	assert.deepEqual(
		splitEqually(14580, [
			{ housemateId: "jay", isOwner: true },
			{ housemateId: "oliver", isOwner: false },
			{ housemateId: "sarah", isOwner: false },
		]),
		[
			{ housemateId: "oliver", amountCents: 4860 },
			{ housemateId: "sarah", amountCents: 4860 },
		],
	);
});
