import assert from "node:assert/strict";
import { test } from "node:test";
import { type ReceiptRow, type ShareRow, buildAccount } from "../account";
import {
	type StatementBill,
	type StatementPayment,
	buildStatement,
} from "../statement";

// Sydney midnight on the given day, as bills store due dates.
const sydney = (day: string, time = "00:00") =>
	Math.floor(new Date(`${day}T${time}:00+10:00`).getTime() / 1000);
const now = sydney("2026-09-24", "12:00");

function bill(
	id: string,
	name: string,
	due: string,
	amountCents: number,
): ShareRow {
	return {
		id,
		billId: `bill-${id}`,
		housemateId: "sarah",
		isOwner: false,
		name,
		billType: null,
		category: "bill",
		stackGroup: null,
		recurringTemplateName: null,
		dueAt: sydney(due),
		billPeriodStart: null,
		billPeriodEnd: null,
		amountCents,
	};
}

function receipt(
	id: string,
	at: number,
	amountCents: number,
	allocations: ReceiptRow["allocations"],
): ReceiptRow {
	return {
		id,
		sourceKeys: [id.startsWith("bank:") ? `bank:source-${id}` : id],
		description: "Payment received · SECRET BANK MESSAGE",
		amountCents,
		receivedAt: at,
		receivedDateKnown: true,
		recordedAt: at,
		bankMatched: id.startsWith("bank:"),
		manual: id.startsWith("manual:"),
		cash: id.startsWith("manual:cash-"),
		allocations,
	};
}

const bank = "bank:tx-secret-1";
const cash = "manual:cash-abc";
const held = "bank:tx-secret-2";
const split = "bank:tx-secret-3";
const bills = [
	bill("rent-18", "Rent", "2026-09-18", 37200),
	bill("rent-01", "Rent", "2026-09-01", 37200),
	bill("cleaners", "Cleaners", "2026-09-26", 3000),
	bill("gas", "Gas", "2026-09-10", 2141),
	bill("pool", "Pool", "2026-09-30", 1250),
	bill("power", "Power", "2026-10-02", 10623),
	bill("water", "Water", "2026-07-15", 5000),
	bill("internet", "Internet", "2026-06-20", 2000),
	bill("june-rent", "Rent", "2026-05-31", 37200),
];
const receipts = [
	receipt(bank, sydney("2026-09-17", "09:30"), 74400, [
		{ debtId: "rent-18", amountCents: 37200 },
		{ debtId: "rent-01", amountCents: 37200 },
	]),
	receipt(cash, sydney("2026-09-12", "18:00"), 1000, [
		{ debtId: "gas", amountCents: 1000 },
	]),
	receipt(split, sydney("2026-09-22", "10:00"), 3000, [
		{ debtId: "pool", amountCents: 250 },
	]),
	receipt("bank:tx-july", sydney("2026-07-16", "10:00"), 5000, [
		{ debtId: "water", amountCents: 5000 },
	]),
	receipt("manual:ledger-refund", sydney("2026-09-21"), -500, []),
];

// The receipts leave $72.50 unallocated: $50 held, $27.50 from the split
// transfer, less a $5 refund. A hidden adjustment sets the credit the account
// applies to its open shares, oldest due first.
function build(creditCents = 0) {
	const account = buildAccount({
		housemate: { id: "sarah", name: "Sarah", isOwner: false },
		shares: bills,
		receipts: [
			...receipts,
			receipt(held, sydney("2026-09-20", "08:00"), 5000, []),
			receipt(
				"manual:ledger-adjust",
				sydney("2026-05-01"),
				creditCents - 7250,
				[],
			),
		],
		now,
	});
	return buildStatement(account, now);
}

const find = (timeline: ReturnType<typeof build>, id: string) =>
	[...timeline.recent, ...timeline.earlier]
		.flatMap((month) => month.items)
		.find((item) => item.id === id);
const billItem = (timeline: ReturnType<typeof build>, id: string) =>
	find(timeline, `bill-${id}`) as StatementBill;

test("months are grouped by Sydney month, newest first, rows newest first", () => {
	const timeline = build();
	assert.deepEqual(
		timeline.recent.map((month) => month.label),
		["October 2026", "September 2026", "July 2026"],
	);
	const september = timeline.recent[1];
	assert.ok(september.items.some((item) => item.id === "bill-rent-01"));
	const dates = september.items.map((item) => item.at);
	assert.deepEqual(
		dates,
		[...dates].sort((a, b) => b - a),
	);
	assert.equal(september.items[0].id, "bill-pool");
	assert.equal(september.items.at(-1)?.id, "bill-rent-01");
});

test("the default view is the last three months, older months kept apart", () => {
	const timeline = build();
	assert.deepEqual(
		timeline.earlier.map((month) => month.label),
		["June 2026", "May 2026"],
	);
});

test("bill statuses cover paid, part paid, overdue and not yet due", () => {
	const timeline = build();
	assert.equal(billItem(timeline, "rent-18").status, "paid");
	assert.equal(billItem(timeline, "rent-18").leftCents, 0);
	assert.equal(billItem(timeline, "pool").status, "part");
	assert.equal(billItem(timeline, "pool").leftCents, 1000);
	assert.equal(billItem(timeline, "gas").status, "overdue");
	assert.equal(billItem(timeline, "gas").leftCents, 1141);
	assert.equal(billItem(timeline, "cleaners").status, "due");
	assert.equal(billItem(timeline, "power").status, "due");
	assert.equal(billItem(timeline, "internet").status, "overdue");
});

test("covered by credit follows the pay page's per-share cover, oldest first", () => {
	// $400 covers June rent ($372), internet ($20), then $8 of gas.
	const timeline = build(40000);
	assert.equal(billItem(timeline, "june-rent").status, "covered");
	assert.equal(billItem(timeline, "internet").status, "covered");
	assert.equal(billItem(timeline, "gas").status, "overdue");
	assert.equal(billItem(timeline, "gas").leftCents, 341);
	assert.equal(billItem(timeline, "gas").creditCents, 800);
	assert.equal(billItem(timeline, "internet").creditCents, 2000);
	assert.equal(billItem(timeline, "cleaners").status, "due");
	const all = build(100000);
	for (const id of [
		"june-rent",
		"internet",
		"gas",
		"cleaners",
		"pool",
		"power",
	])
		assert.equal(billItem(all, id).status, "covered", id);
});

test("a bill lists the payments that paid it", () => {
	const gas = billItem(build(), "gas");
	assert.deepEqual(gas.payments, [
		{
			label: "Cash received",
			at: sydney("2026-09-12", "18:00"),
			amountCents: 1000,
		},
	]);
});

test("payments name the bills they covered and any credit held", () => {
	const timeline = build();
	const payments = timeline.recent
		.flatMap((month) => month.items)
		.filter((item): item is StatementPayment => item.kind === "payment");
	const byAmount = (cents: number) =>
		payments.find((item) => item.amountCents === cents) as StatementPayment;
	assert.equal(byAmount(74400).label, "Payment received");
	assert.equal(byAmount(74400).note, "Covered Rent 18 Sep, Rent 1 Sep");
	assert.deepEqual(byAmount(74400).bills, [
		{ name: "Rent", at: sydney("2026-09-18"), amountCents: 37200 },
		{ name: "Rent", at: sydney("2026-09-01"), amountCents: 37200 },
	]);
	assert.equal(byAmount(1000).label, "Cash received");
	assert.equal(byAmount(1000).note, "Covered Gas 10 Sep");
	assert.equal(byAmount(5000).note, "Held as credit");
	assert.equal(byAmount(5000).heldCents, 5000);
	assert.equal(
		byAmount(3000).note,
		"Covered Pool 30 Sep, $27.50 held as credit",
	);
	assert.equal(
		payments.some((item) => item.amountCents <= 0),
		false,
		"refunds and corrections are not listed",
	);
});

test("the timeline exposes no admin or bank data", () => {
	const serialized = JSON.stringify(build(5000));
	for (const secret of [
		"tx-secret",
		"SECRET BANK MESSAGE",
		"admin suggestion",
		"manual:",
		"bank:",
		"sourceKey",
		"housemateId",
	])
		assert.ok(!serialized.includes(secret), secret);
});
