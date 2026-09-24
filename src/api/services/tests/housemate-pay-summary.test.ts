import assert from "node:assert/strict";
import { test } from "node:test";
import { coverShares } from "../bill-reminder-credit";
import { buildPaySummary, toPayShare } from "../housemate-pay-summary";

const rows = [
	{ housemateId: "sarah", amountOwed: 30, amountPaid: 0 },
	{ housemateId: "sarah", amountOwed: 40, amountPaid: 10 },
];
const shares = (creditCents: number) =>
	coverShares(rows, new Map([["sarah", { amountCents: creditCents }]])).map(
		(share, index) => toPayShare(share, index === 0),
	);

test("no credit leaves every share owing and the bar counts paid parts only", () => {
	const items = shares(0);
	assert.deepEqual(items[0], {
		amountOwed: 30,
		amountPaid: 0,
		remainingAmount: 30,
		coveredAmount: 0,
		remainingAfterCredit: 30,
		isOverdue: true,
	});
	assert.deepEqual(buildPaySummary(items, 0), {
		summary: {
			billCount: 2,
			overdueCount: 1,
			remainingAmount: 60,
			overdueAmount: 30,
		},
		paymentProgress: { settledAmount: 10, percentage: 14 },
		credit: { heldAmount: 0, appliedAmount: 0 },
	});
});

test("partial credit covers the oldest share and only the rest is owed", () => {
	const items = shares(4000);
	assert.deepEqual(
		items.map((item) => [item.coveredAmount, item.remainingAfterCredit]),
		[
			[30, 0],
			[10, 20],
		],
	);
	assert.deepEqual(buildPaySummary(items, 40), {
		summary: {
			billCount: 1,
			overdueCount: 0,
			remainingAmount: 20,
			overdueAmount: 0,
		},
		paymentProgress: { settledAmount: 50, percentage: 71 },
		credit: { heldAmount: 40, appliedAmount: 40 },
	});
});

test("credit that covers everything leaves nothing to pay and names what is left over", () => {
	assert.deepEqual(buildPaySummary(shares(297600), 2976), {
		summary: {
			billCount: 0,
			overdueCount: 0,
			remainingAmount: 0,
			overdueAmount: 0,
		},
		paymentProgress: { settledAmount: 70, percentage: 100 },
		credit: { heldAmount: 2976, appliedAmount: 60 },
	});
	assert.deepEqual(buildPaySummary([], 5).paymentProgress, {
		settledAmount: 0,
		percentage: 100,
	});
});
