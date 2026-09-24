import assert from "node:assert/strict";
import { test } from "node:test";
import { coverShares } from "../bill-reminder-credit";
import {
	buildOverdueDigest,
	overdueDigestKey,
	sydneyDate,
} from "../overdue-digest";

const day = (date: string) => new Date(`${date}T00:00:00Z`);
// 10am in Sydney on 24 Sep 2026, when the daily cron runs.
const now = new Date("2026-09-24T00:00:00Z");
const share = (
	billId: string,
	dueDate: string,
	amountOwed: number,
	amountPaid = 0,
) => ({
	billId,
	housemateId: "oliver",
	billerName: billId,
	recurringTemplateName: null,
	dueDate: day(dueDate),
	amountOwed,
	amountPaid,
});
const rows = [
	share("Rent", "2026-08-24", 100),
	share("AGL Electricity", "2026-09-01", 80),
	share("Water", "2026-09-23", 40),
	share("Internet", "2026-09-24", 25),
	share("Gas", "2026-10-02", 60),
];
const credit = (amountCents: number) => ({ amountCents, receivedAt: null });
const digest = (amountCents: number, at = now) =>
	buildOverdueDigest(
		coverShares(rows, new Map([["oliver", credit(amountCents)]])),
		credit(amountCents),
		at,
	);

test("only shares due before today in Sydney are overdue", () => {
	const result = digest(0);
	assert.deepEqual(
		result?.items.map((item) => [
			item.label,
			item.amountCents,
			item.daysOverdue,
		]),
		[
			["Rent", 10000, 31],
			["AGL Electricity", 8000, 23],
			["Water", 4000, 1],
		],
	);
	assert.equal(result?.overdueCents, 22000);
	assert.equal(result?.creditCents, 0);
	assert.equal(result?.date, "2026-09-24");
});

test("credit is applied oldest first, so a covered bill drops out and a partly covered one shows what is left", () => {
	const result = digest(13000);
	assert.deepEqual(
		result?.items.map((item) => [item.label, item.amountCents]),
		[
			["AGL Electricity", 5000],
			["Water", 4000],
		],
	);
	assert.equal(result?.overdueCents, 9000);
	assert.equal(result?.creditCents, 13000);
});

test("a housemate with nothing overdue after credit gets no digest", () => {
	assert.equal(digest(22000), null);
	assert.equal(digest(50000), null);
	assert.equal(
		buildOverdueDigest(
			coverShares([share("Gas", "2026-10-02", 60)], new Map()),
			null,
			now,
		),
		null,
	);
});

test("partly paid shares count only what is still owed", () => {
	const result = buildOverdueDigest(
		coverShares([share("Rent", "2026-09-20", 100, 60)], new Map()),
		null,
		now,
	);
	assert.deepEqual(
		result?.items.map((item) => [item.label, item.amountCents]),
		[["Rent", 4000]],
	);
});

test("the Sydney date decides what is overdue, not the UTC date", () => {
	// 23:59 on 24 Sep in Sydney: a bill due on the 24th is not overdue yet.
	const lateOn24th = new Date("2026-09-24T13:59:00Z");
	assert.equal(sydneyDate(lateOn24th), "2026-09-24");
	assert.deepEqual(
		digest(0, lateOn24th)?.items.map((item) => item.label),
		["Rent", "AGL Electricity", "Water"],
	);
	// 00:00 on 25 Sep in Sydney, still the 24th in UTC.
	const midnight = new Date("2026-09-24T14:00:00Z");
	assert.equal(sydneyDate(midnight), "2026-09-25");
	const result = digest(0, midnight);
	assert.deepEqual(
		result?.items.map((item) => [item.label, item.daysOverdue]),
		[
			["Rent", 32],
			["AGL Electricity", 24],
			["Water", 2],
			["Internet", 1],
		],
	);
	// A due date stored at Sydney midnight still reads as its Sydney day.
	assert.equal(sydneyDate(new Date("2026-09-23T14:00:00Z")), "2026-09-24");
});

test("the event key is one per housemate per Sydney day", () => {
	assert.equal(
		overdueDigestKey("oliver", now),
		"overdue-digest:oliver:2026-09-24",
	);
	assert.equal(
		overdueDigestKey("oliver", new Date("2026-09-24T13:59:00Z")),
		overdueDigestKey("oliver", now),
	);
	assert.equal(
		overdueDigestKey("oliver", new Date("2026-09-24T14:00:00Z")),
		"overdue-digest:oliver:2026-09-25",
	);
	assert.notEqual(
		overdueDigestKey("sarah", now),
		overdueDigestKey("oliver", now),
	);
});

test("recurring template names join the bill label", () => {
	const result = buildOverdueDigest(
		coverShares(
			[
				{
					...share("Hudson McHugh", "2026-09-20", 250),
					recurringTemplateName: "Weekly Rent",
				},
			],
			new Map(),
		),
		null,
		now,
	);
	assert.equal(result?.items[0]?.label, "Hudson McHugh Weekly Rent");
});
