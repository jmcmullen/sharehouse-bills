import assert from "node:assert/strict";
import { test } from "node:test";
import {
	buildOverdueDigestSummary,
	buildPaymentArrivedSummary,
	buildPaymentCorrectionSummary,
	buildPaymentReceiptSummary,
} from "../whatsapp-message-composer";

const received = new Date("2026-09-12T02:00:00Z");
const gas = {
	billName: "Gas",
	dueDate: new Date("2026-09-12T02:00:00Z"),
	amountCents: 10000,
};
const cleaners = {
	billName: "Cleaners",
	dueDate: new Date("2026-09-15T02:00:00Z"),
	amountCents: 9900,
};

test("payment receipt names the bills covered, leftover credit and balance", () => {
	const lines = buildPaymentReceiptSummary({
		firstName: "Oliver",
		amountCents: 24900,
		receivedAt: received,
		covered: [gas, cleaners],
		creditCents: 5000,
		balanceCents: 12000,
	}).split("\n");
	assert.equal(lines[0], "*Thanks Oliver, payment received*");
	assert.equal(lines[1], "$249.00 on Sat 12 Sep");
	assert.equal(lines[3], "Covers:");
	assert.equal(lines[4], "- Gas (due Sat 12 Sep) · $100.00 · on the due date");
	assert.equal(lines[5], "- Cleaners (due Tue 15 Sep) · $99.00 · 3 days early");
	assert.equal(lines[7], "$50.00 is held as credit for your next bill.");
	assert.equal(lines[8], "You still owe $120.00.");
	assert.equal(lines.length, 9);
});

test("receipt lines time each bill against the day the money arrived", () => {
	const lines = buildPaymentReceiptSummary({
		firstName: "Oliver",
		amountCents: 60000,
		receivedAt: received,
		covered: [
			{
				billName: "Rent",
				dueDate: new Date("2026-08-21T00:00:00Z"),
				amountCents: 37200,
			},
			{
				billName: "Water",
				dueDate: new Date("2025-12-01T00:00:00Z"),
				amountCents: 12800,
			},
			{ billName: "Pool", dueDate: null, amountCents: 10000 },
		],
		creditCents: 0,
		balanceCents: 0,
	}).split("\n");
	assert.deepEqual(lines.slice(4, 7), [
		"- Rent (due Fri 21 Aug) · $372.00 · 3 weeks late",
		"- Water (due Mon 1 Dec 2025) · $128.00 · 9 months late",
		"- Pool · $100.00",
	]);
});

test("credit-held receipt says the money waits for the next bill", () => {
	const message = buildPaymentReceiptSummary({
		firstName: "Oliver",
		amountCents: 5000,
		receivedAt: received,
		covered: [],
		creditCents: 5000,
		balanceCents: -5000,
	});
	assert.equal(
		message,
		[
			"*Thanks Oliver, payment received*",
			"$50.00 on Sat 12 Sep",
			"",
			"This payment is held as credit for your next bill.",
			"You're $50.00 in credit.",
		].join("\n"),
	);
});

test("payment correction lists the bills before and after the change", () => {
	const message = buildPaymentCorrectionSummary({
		firstName: "Oliver",
		amountCents: 10000,
		receivedAt: received,
		before: [gas],
		after: [],
		creditCents: 10000,
		balanceCents: 0,
	});
	assert.equal(
		message,
		[
			"*Oliver, a correction to your payment*",
			"$100.00 on Sat 12 Sep",
			"",
			"Previously covered:",
			"- Gas (due Sat 12 Sep) · $100.00 · on the due date",
			"",
			"Now held as credit for your next bill.",
			"You're all settled up.",
		].join("\n"),
	);
	const reallocated = buildPaymentCorrectionSummary({
		firstName: "Oliver",
		amountCents: 9900,
		receivedAt: received,
		before: [],
		after: [cleaners],
		creditCents: 0,
		balanceCents: 0,
	}).split("\n");
	assert.equal(reallocated[3], "Previously held as credit.");
	assert.equal(reallocated[5], "Now covers:");
	assert.equal(
		reallocated[6],
		"- Cleaners (due Tue 15 Sep) · $99.00 · 3 days early",
	);
});

test("payment arrived tells the owner who paid, what it looks like and where to review", () => {
	const lines = buildPaymentArrivedSummary({
		senderName: "Oliver",
		amountCents: 42000,
		receivedAt: received,
		reference: "Rent",
		shared: false,
		suggestion: ["Rent · 12 Sep, $420.00"],
		reviewUrl: "https://bills.example/payment-review?query=bank-1",
	}).split("\n");
	assert.equal(lines[0], "*Payment arrived from Oliver*");
	assert.equal(lines[1], '$420.00 on Sat 12 Sep · "Rent"');
	assert.equal(lines[3], "Looks like Rent · 12 Sep, $420.00");
	assert.equal(
		lines[4],
		"Review: https://bills.example/payment-review?query=bank-1",
	);
	assert.equal(lines.length, 5);
});

test("payment arrived without a match or reference says so, and shared payments ask for a split", () => {
	const none = buildPaymentArrivedSummary({
		senderName: "Oliver",
		amountCents: 1000,
		receivedAt: received,
		reference: "",
		shared: false,
		suggestion: null,
		reviewUrl: "https://bills.example/payment-review?query=bank-2",
	}).split("\n");
	assert.equal(none[1], "$10.00 on Sat 12 Sep · no reference");
	assert.equal(none[3], "No matching bill");
	const shared = buildPaymentArrivedSummary({
		senderName: "Oliver + Sarah",
		amountCents: 30000,
		receivedAt: received,
		reference: "Oliver and Sarah rent",
		shared: true,
		suggestion: null,
		reviewUrl: "https://bills.example/payment-review?query=bank-3",
	}).split("\n");
	assert.equal(shared[0], "*Payment arrived from Oliver + Sarah*");
	assert.equal(shared[3], "Shared payment: choose how much belongs to each");
});

const payUrl = "https://bills.example/pay/abc";
const item = (label: string, amountCents: number, daysOverdue: number) => ({
	label,
	amountCents,
	daysOverdue,
});

test("overdue digest greets by first name, totals, lists each bill and links to pay", () => {
	assert.equal(
		buildOverdueDigestSummary({
			firstName: "Oliver",
			items: [
				item("AGL Electricity", 20512, 31),
				item("Hudson McHugh Weekly Rent", 20724, 1),
			],
			overdueCents: 41236,
			creditCents: 5000,
			payUrl,
		}),
		[
			"*Hi Oliver, you have $412.36 overdue*",
			"",
			"- AGL Electricity · $205.12 · 31 days overdue",
			"- Hudson McHugh Weekly Rent · $207.24 · 1 day overdue",
			"",
			"$50.00 of your credit is already applied.",
			payUrl,
		].join("\n"),
	);
});

test("overdue digest leaves out the credit line when no credit was applied", () => {
	assert.equal(
		buildOverdueDigestSummary({
			firstName: "Sarah",
			items: [item("Water", 4000, 2)],
			overdueCents: 4000,
			creditCents: 0,
			payUrl,
		}),
		[
			"*Hi Sarah, you have $40.00 overdue*",
			"",
			"- Water · $40.00 · 2 days overdue",
			"",
			payUrl,
		].join("\n"),
	);
});

test("overdue digest lists at most 8 bills, then says how many more", () => {
	const items = Array.from({ length: 11 }, (_, index) =>
		item(`Bill ${index + 1}`, 1000, 11 - index),
	);
	const lines = buildOverdueDigestSummary({
		firstName: "Oliver",
		items,
		overdueCents: 11000,
		creditCents: 0,
		payUrl,
	}).split("\n");
	assert.equal(lines[2], "- Bill 1 · $10.00 · 11 days overdue");
	assert.equal(lines[9], "- Bill 8 · $10.00 · 4 days overdue");
	assert.equal(lines[10], "+3 more");
	assert.equal(lines.at(-1), payUrl);
	assert.equal(lines.filter((line) => line.startsWith("- ")).length, 8);
	const exact = buildOverdueDigestSummary({
		firstName: "Oliver",
		items: items.slice(0, 8),
		overdueCents: 8000,
		creditCents: 0,
		payUrl,
	});
	assert.equal(exact.includes("more"), false);
});
