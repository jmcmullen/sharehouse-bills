import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAccount, buildBill } from "../account";
import {
	balanceCents,
	billSettledAt,
	billStatus,
	buildPaySummary,
	coverShares,
	creditCents,
	overdueCents,
	owesCents,
	paidPercentage,
	shareState,
	statementHeadline,
	upcomingCents,
} from "../compute";

// Sydney midnight on the given day, as bills store due dates.
const sydney = (day: string, time = "00:00") =>
	Math.floor(new Date(`${day}T${time}:00+10:00`).getTime() / 1000);
const now = sydney("2026-10-11", "12:00");

test("a share's paid, remaining and settled date come from its allocations", () => {
	const cases: Array<{
		name: string;
		amount: number;
		payments: Array<{ amountCents: number; receivedAt: number }>;
		expected: ReturnType<typeof shareState>;
	}> = [
		{
			name: "nothing allocated",
			amount: 6000,
			payments: [],
			expected: { paidCents: 0, remainingCents: 6000, settledAt: null },
		},
		{
			name: "part paid has no settled date",
			amount: 6000,
			payments: [{ amountCents: 2500, receivedAt: 10 }],
			expected: { paidCents: 2500, remainingCents: 3500, settledAt: null },
		},
		{
			name: "paid in two receipts settles on the later one",
			amount: 6000,
			payments: [
				{ amountCents: 2500, receivedAt: 30 },
				{ amountCents: 3500, receivedAt: 20 },
			],
			expected: { paidCents: 6000, remainingCents: 0, settledAt: 30 },
		},
		{
			name: "one cent short is still owing",
			amount: 6000,
			payments: [{ amountCents: 5999, receivedAt: 10 }],
			expected: { paidCents: 5999, remainingCents: 1, settledAt: null },
		},
		{
			name: "overpaid never goes negative",
			amount: 6000,
			payments: [{ amountCents: 7000, receivedAt: 10 }],
			expected: { paidCents: 7000, remainingCents: 0, settledAt: 10 },
		},
		{
			name: "a zero share with no money is not settled",
			amount: 0,
			payments: [],
			expected: { paidCents: 0, remainingCents: 0, settledAt: null },
		},
	];
	for (const item of cases)
		assert.deepEqual(
			shareState(item.amount, item.payments),
			item.expected,
			item.name,
		);
});

test("bill status and settled date ignore shares the owner carries", () => {
	const share = (
		paidCents: number,
		remainingCents: number,
		settledAt: number | null = null,
		isOwner = false,
	) => ({ paidCents, remainingCents, settledAt, isOwner });
	const cases = [
		{
			name: "no money",
			shares: [share(0, 50), share(0, 50)],
			status: "pending",
			at: null,
		},
		{
			name: "one part",
			shares: [share(10, 40), share(0, 50)],
			status: "partially_paid",
			at: null,
		},
		{
			name: "one fully",
			shares: [share(50, 0, 5), share(0, 50)],
			status: "partially_paid",
			at: null,
		},
		{
			name: "all paid",
			shares: [share(50, 0, 5), share(50, 0, 9)],
			status: "paid",
			at: 9,
		},
		{
			name: "owner open",
			shares: [share(50, 0, 5), share(0, 50, null, true)],
			status: "paid",
			at: 5,
		},
		{ name: "no shares", shares: [], status: "paid", at: null },
	] as const;
	for (const item of cases) {
		assert.equal(billStatus([...item.shares]), item.status, item.name);
		assert.equal(billSettledAt([...item.shares]), item.at, item.name);
	}
});

test("credit is money received less what is allocated", () => {
	const cases = [
		{ receipts: [], expected: 0 },
		{ receipts: [{ amountCents: 5000, allocations: [] }], expected: 5000 },
		{
			receipts: [
				{ amountCents: 5000, allocations: [{ amountCents: 3000 }] },
				{ amountCents: 2000, allocations: [{ amountCents: 2000 }] },
			],
			expected: 2000,
		},
		{
			receipts: [
				{ amountCents: 5000, allocations: [] },
				{ amountCents: -1500, allocations: [] },
			],
			expected: 3500,
		},
	];
	for (const item of cases)
		assert.equal(creditCents(item.receipts), item.expected);
});

test("credit covers open shares oldest due first", () => {
	const shares = [
		{ id: "gas", dueAt: 20, remainingCents: 5000 },
		{ id: "rent", dueAt: 10, remainingCents: 12000 },
		{ id: "paid", dueAt: 5, remainingCents: 0 },
		{ id: "water", dueAt: 20, remainingCents: 4000 },
	];
	const cases: Array<[number, Array<[string, number, number]>]> = [
		[
			0,
			[
				["paid", 0, 0],
				["rent", 0, 12000],
				["gas", 0, 5000],
				["water", 0, 4000],
			],
		],
		[
			13000,
			[
				["paid", 0, 0],
				["rent", 12000, 0],
				["gas", 1000, 4000],
				["water", 0, 4000],
			],
		],
		[
			999999,
			[
				["paid", 0, 0],
				["rent", 12000, 0],
				["gas", 5000, 0],
				["water", 4000, 0],
			],
		],
		[
			-500,
			[
				["paid", 0, 0],
				["rent", 0, 12000],
				["gas", 0, 5000],
				["water", 0, 4000],
			],
		],
	];
	for (const [credit, expected] of cases)
		assert.deepEqual(
			coverShares(shares, credit).map((row) => [
				row.id,
				row.coveredCents,
				row.leftCents,
			]),
			expected,
			String(credit),
		);
	assert.equal(shares[0].id, "gas", "input is not reordered");
});

test("owes, balance, overdue and upcoming follow the derivation rules", () => {
	const shares = [
		{ amountCents: 10000, remainingCents: 10000 },
		{ amountCents: 6000, remainingCents: 1000 },
	];
	const cases = [
		{ credit: 0, owes: 11000 },
		{ credit: 4000, owes: 7000 },
		{ credit: 20000, owes: 0 },
		// A refund larger than the credit held is not more owed on bills: owes
		// floors credit the way the cover does, and the balance keeps the sign.
		{ credit: -500, owes: 11000 },
	];
	for (const item of cases)
		assert.equal(
			owesCents(shares, item.credit),
			item.owes,
			String(item.credit),
		);
	assert.equal(
		balanceCents(shares, [{ amountCents: 5000 }, { amountCents: -500 }]),
		11500,
	);
	const due = [
		{ dueAt: sydney("2026-10-10"), leftCents: 300, remainingCents: 300 },
		{ dueAt: sydney("2026-10-11"), leftCents: 500, remainingCents: 500 },
		{ dueAt: sydney("2026-10-12"), leftCents: 0, remainingCents: 700 },
		{ dueAt: sydney("2026-10-13"), leftCents: 200, remainingCents: 900 },
	];
	assert.equal(overdueCents(due, now), 300);
	assert.equal(upcomingCents(due, now), 200, "upcoming is what credit leaves");
});

test("progress is by amount and only reaches 100% when settled", () => {
	const cases: Array<[number, number, number]> = [
		[186460, 186575, 99],
		[186575, 186575, 100],
		[186574, 186575, 99],
		[74630, 186575, 40],
		[0, 10000, 0],
		[0, 0, 100],
		[40, 10000, 0],
	];
	for (const [settled, total, expected] of cases)
		assert.equal(paidPercentage(settled, total), expected);
});

test("the pay summary counts only what is left after credit", () => {
	const items = (coverCents: number) =>
		coverShares(
			[
				{
					id: "a",
					dueAt: 1,
					amountCents: 3000,
					paidCents: 0,
					remainingCents: 3000,
				},
				{
					id: "b",
					dueAt: 2,
					amountCents: 4000,
					paidCents: 1000,
					remainingCents: 3000,
				},
			],
			coverCents,
		).map((share) => ({ ...share, isOverdue: share.id === "a" }));
	assert.deepEqual(buildPaySummary(items(0), 0), {
		summary: {
			billCount: 2,
			overdueCount: 1,
			remainingCents: 6000,
			overdueCents: 3000,
		},
		paymentProgress: { settledCents: 1000, percentage: 14 },
		credit: { heldCents: 0, appliedCents: 0 },
	});
	assert.deepEqual(buildPaySummary(items(4000), 4000), {
		summary: {
			billCount: 1,
			overdueCount: 0,
			remainingCents: 2000,
			overdueCents: 0,
		},
		paymentProgress: { settledCents: 5000, percentage: 71 },
		credit: { heldCents: 4000, appliedCents: 4000 },
	});
	assert.deepEqual(buildPaySummary(items(297600), 297600).summary, {
		billCount: 0,
		overdueCount: 0,
		remainingCents: 0,
		overdueCents: 0,
	});
	assert.deepEqual(buildPaySummary([], 500).paymentProgress, {
		settledCents: 0,
		percentage: 100,
	});
});

test("the headline says owed, in credit, all covered or all sorted", () => {
	const cases = [
		[{ owesCents: 1250, creditCents: 0, coveredCents: 0 }, "You owe", 1250],
		[
			{ owesCents: 0, creditCents: 5000, coveredCents: 3000 },
			"In credit",
			2000,
		],
		[{ owesCents: 0, creditCents: 3000, coveredCents: 3000 }, "All covered", 0],
		[{ owesCents: 0, creditCents: 0, coveredCents: 0 }, "All sorted", 0],
	] as const;
	for (const [input, label, amountCents] of cases)
		assert.deepEqual(statementHeadline(input), { label, amountCents });
});

const shareRow = (
	id: string,
	due: string,
	amountCents: number,
	housemateId = "oliver",
) => ({
	id,
	billId: `bill-${id}`,
	housemateId,
	isOwner: false,
	name: id,
	billType: null,
	category: "bill",
	stackGroup: null,
	recurringTemplateName: null,
	dueAt: sydney(due),
	billPeriodStart: null,
	billPeriodEnd: null,
	amountCents,
});
const receiptRow = (
	id: string,
	amountCents: number,
	receivedAt: number,
	allocations: Array<{ debtId: string; amountCents: number }>,
) => ({
	id,
	kind: "bank" as const,
	bankTransactionId: id,
	description: "Payment received",
	note: "",
	amountCents,
	receivedAt,
	recordedAt: receivedAt,
	voidedAt: null,
	voidReason: null,
	allocations,
});

test("an account derives every figure from shares, receipts and allocations", () => {
	const account = buildAccount({
		housemate: { id: "oliver", name: "Oliver", isOwner: false },
		shares: [
			shareRow("gas", "2026-10-20", 6000),
			shareRow("rent", "2026-09-20", 12000),
			shareRow("water", "2026-10-01", 4000),
		],
		receipts: [
			receiptRow("r1", 10000, sydney("2026-09-21"), [
				{ debtId: "rent", amountCents: 8000 },
			]),
			receiptRow("r2", 3000, sydney("2026-09-25"), [
				{ debtId: "rent", amountCents: 3000 },
			]),
		],
		now,
	});
	assert.deepEqual(
		account.shares.map((share) => [
			share.id,
			share.paidCents,
			share.remainingCents,
			share.coveredCents,
			share.leftCents,
			share.overdue,
		]),
		[
			["rent", 11000, 1000, 1000, 0, true],
			["water", 0, 4000, 1000, 3000, true],
			["gas", 0, 6000, 0, 6000, false],
		],
	);
	assert.equal(account.creditCents, 2000);
	assert.equal(account.coveredCents, 2000);
	assert.equal(account.remainingCents, 11000);
	assert.equal(account.owesCents, 9000);
	assert.equal(account.overdueCents, 3000);
	assert.equal(account.upcomingCents, 6000);
	assert.equal(account.balanceCents, 9000);
	assert.deepEqual(
		account.receipts.map((receipt) => [receipt.id, receipt.unallocatedCents]),
		[
			["r2", 0],
			["r1", 2000],
		],
	);
	const bill = buildBill(
		{
			id: "bill-rent",
			name: "Rent",
			totalCents: 12000,
			dueAt: sydney("2026-09-20"),
			billType: null,
			stackGroup: null,
			recurringTemplateName: null,
			billPeriodStart: null,
			billPeriodEnd: null,
		},
		[account],
	);
	assert.equal(bill.status, "partially_paid");
	assert.equal(bill.paidCents, 11000);
	assert.equal(bill.settledAt, null);
});
