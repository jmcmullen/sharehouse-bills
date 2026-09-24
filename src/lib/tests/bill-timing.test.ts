import assert from "node:assert/strict";
import { test } from "node:test";
import {
	formatDueDate,
	formatPaidTiming,
	formatTiming,
	sydneyDaysBetween,
} from "../bill-timing";

// Due dates are stored as UTC midnight, which is 10am or 11am in Sydney.
const due = new Date("2026-09-18T00:00:00Z");
const now = new Date("2026-09-24T02:00:00Z");

function after(days: number) {
	return new Date(due.getTime() + days * 86_400_000);
}

test("due date drops the year only within the current Sydney year", () => {
	assert.equal(formatDueDate(due, now), "Fri 18 Sep");
	assert.equal(formatDueDate("2026-09-18T00:00:00.000Z", now), "Fri 18 Sep");
	assert.equal(
		formatDueDate(new Date("2025-09-18T00:00:00Z"), now),
		"Thu 18 Sep 2025",
	);
	assert.equal(
		formatDueDate(new Date("2027-01-04T00:00:00Z"), now),
		"Mon 4 Jan 2027",
	);
});

test("due date and the current year are both read on the Sydney calendar", () => {
	// 31 Dec 2026 14:30 UTC is already 1 Jan 2027 in Sydney.
	const newYear = new Date("2026-12-31T14:30:00Z");
	assert.equal(formatDueDate(newYear, newYear), "Fri 1 Jan");
	assert.equal(
		formatDueDate(new Date("2026-12-31T00:00:00Z"), newYear),
		"Thu 31 Dec 2026",
	);
	// 17 Sep 14:00 UTC is midnight 18 Sep in Sydney.
	assert.equal(
		formatDueDate(new Date("2026-09-17T14:00:00Z"), now),
		"Fri 18 Sep",
	);
	assert.equal(
		formatDueDate(new Date("2026-09-17T13:59:00Z"), now),
		"Thu 17 Sep",
	);
});

test("paid timing counts Sydney calendar days, not elapsed hours", () => {
	assert.equal(
		formatPaidTiming(due, new Date("2026-09-18T13:59:00Z")),
		"Paid on the due date",
	);
	assert.equal(
		formatPaidTiming(due, new Date("2026-09-18T14:00:00Z")),
		"Paid 1 day late",
	);
	assert.equal(
		formatPaidTiming(due, new Date("2026-09-17T13:59:00Z")),
		"Paid 1 day early",
	);
	assert.equal(
		formatPaidTiming(due, new Date("2026-09-17T14:00:00Z")),
		"Paid on the due date",
	);
	assert.equal(sydneyDaysBetween(due, new Date("2026-09-18T14:00:00Z")), 1);
});

test("paid timing uses days up to 13, then whole weeks up to 8 weeks", () => {
	assert.equal(formatPaidTiming(due, due), "Paid on the due date");
	assert.equal(formatPaidTiming(due, after(1)), "Paid 1 day late");
	assert.equal(formatPaidTiming(due, after(2)), "Paid 2 days late");
	assert.equal(formatPaidTiming(due, after(13)), "Paid 13 days late");
	assert.equal(formatPaidTiming(due, after(14)), "Paid 2 weeks late");
	assert.equal(formatPaidTiming(due, after(20)), "Paid 2 weeks late");
	assert.equal(formatPaidTiming(due, after(21)), "Paid 3 weeks late");
	assert.equal(formatPaidTiming(due, after(56)), "Paid 8 weeks late");
});

test("paid timing beyond 8 weeks uses whole calendar months, at least 2", () => {
	assert.equal(formatPaidTiming(due, after(57)), "Paid 2 months late");
	assert.equal(
		formatPaidTiming(due, new Date("2026-12-17T00:00:00Z")),
		"Paid 2 months late",
	);
	assert.equal(
		formatPaidTiming(due, new Date("2026-12-18T00:00:00Z")),
		"Paid 3 months late",
	);
	assert.equal(
		formatPaidTiming(due, new Date("2027-09-18T00:00:00Z")),
		"Paid 12 months late",
	);
});

test("paid timing applies the same units when paid early", () => {
	assert.equal(formatPaidTiming(due, after(-1)), "Paid 1 day early");
	assert.equal(formatPaidTiming(due, after(-3)), "Paid 3 days early");
	assert.equal(formatPaidTiming(due, after(-13)), "Paid 13 days early");
	assert.equal(formatPaidTiming(due, after(-14)), "Paid 2 weeks early");
	assert.equal(formatPaidTiming(due, after(-56)), "Paid 8 weeks early");
	assert.equal(formatPaidTiming(due, after(-57)), "Paid 2 months early");
	assert.equal(
		formatPaidTiming(due, new Date("2026-06-18T00:00:00Z")),
		"Paid 3 months early",
	);
});

test("short timing drops the Paid prefix for card lines", () => {
	assert.equal(formatTiming(due, after(-3)), "3 days early");
	assert.equal(formatTiming(due, after(14)), "2 weeks late");
	assert.equal(formatTiming(due, due), "on the due date");
});
