import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBillPreview, getBillDueStatus } from "../share-preview";

const now = new Date("2026-09-24T02:00:00Z");
const rent = {
	billLabel: "Hudson McHugh Weekly Rent",
	dueDate: new Date("2026-09-18T00:00:00Z"),
	totalAmount: 1940,
	hasEvenShares: true,
	amountEach: 485,
	participantCount: 4,
	isAllSorted: true,
	settledAt: new Date("2026-09-15T03:00:00Z"),
};

test("a paid bill preview names its due date and how early it was paid", () => {
	assert.deepEqual(buildBillPreview(rent, now), {
		title: "Hudson McHugh Weekly Rent due Fri 18 Sep paid in full",
		description: "Paid 3 days early. Thanks everyone for settling up.",
		card: {
			tone: "paid",
			primary: "Paid in full",
			secondary: "Due Fri 18 Sep · 3 days early",
			tertiary: "Total $1,940.00",
		},
	});
});

test("a paid bill from a past year shows the year, and late payment reads as late", () => {
	const preview = buildBillPreview(
		{
			...rent,
			dueDate: new Date("2025-09-18T00:00:00Z"),
			settledAt: new Date("2025-10-02T00:00:00Z"),
		},
		now,
	);
	assert.equal(
		preview.title,
		"Hudson McHugh Weekly Rent due Thu 18 Sep 2025 paid in full",
	);
	assert.equal(
		preview.description,
		"Paid 2 weeks late. Thanks everyone for settling up.",
	);
	assert.equal(preview.card.secondary, "Due Thu 18 Sep 2025 · 2 weeks late");
});

test("a paid bill with no known paid date still shows its due date", () => {
	const preview = buildBillPreview({ ...rent, settledAt: null }, now);
	assert.equal(preview.description, "Thanks everyone for settling up.");
	assert.equal(preview.card.secondary, "Due Fri 18 Sep");
});

test("an overdue bill preview shows how late and the due date", () => {
	const preview = buildBillPreview(
		{
			billLabel: "AGL Electricity",
			dueDate: new Date("2026-09-19T00:00:00Z"),
			totalAmount: 531.14,
			hasEvenShares: false,
			amountEach: null,
			participantCount: 5,
			isAllSorted: false,
			settledAt: null,
		},
		now,
	);
	assert.deepEqual(preview, {
		title: "AGL Electricity bill is overdue",
		description:
			"Overdue by 5 days · due Sat 19 Sep. Split across 5 housemates.",
		card: {
			tone: "overdue",
			primary: "$531.14",
			secondary: "Overdue by 5 days · due Sat 19 Sep",
			tertiary: "Split across 5 housemates",
		},
	});
});

test("a bill due today shows today's date", () => {
	const preview = buildBillPreview(
		{
			...rent,
			dueDate: new Date("2026-09-24T00:00:00Z"),
			isAllSorted: false,
			settledAt: null,
		},
		now,
	);
	assert.equal(preview.title, "Hudson McHugh Weekly Rent bill is due today");
	assert.equal(preview.description, "Due today · Thu 24 Sep. $485.00 each.");
	assert.equal(preview.card.secondary, "Due today · Thu 24 Sep");
	assert.equal(preview.card.tertiary, "Total $1,940.00");
});

test("a new bill preview shows the amount each, the due date and the total", () => {
	const preview = buildBillPreview(
		{
			billLabel: "Cleaners",
			dueDate: new Date("2026-09-30T00:00:00Z"),
			totalAmount: 150,
			hasEvenShares: true,
			amountEach: 30,
			participantCount: 5,
			isAllSorted: false,
			settledAt: null,
		},
		now,
	);
	assert.deepEqual(preview, {
		title: "Bill from Cleaners for $150.00",
		description: "Due Wed 30 Sep. $30.00 each.",
		card: {
			tone: "soon",
			primary: "$30.00 each",
			secondary: "Due Wed 30 Sep",
			tertiary: "Total $150.00",
		},
	});
});

test("due status counts Sydney calendar days", () => {
	assert.equal(
		getBillDueStatus(
			new Date("2026-09-24T00:00:00Z"),
			new Date("2026-09-24T13:59:00Z"),
		).label,
		"Due today",
	);
	assert.equal(
		getBillDueStatus(
			new Date("2026-09-24T00:00:00Z"),
			new Date("2026-09-24T14:00:00Z"),
		).label,
		"Overdue by 1 day",
	);
});
