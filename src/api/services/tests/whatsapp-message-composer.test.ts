import assert from "node:assert/strict";
import { test } from "node:test";
import {
	buildBillReminderSummary,
	buildCreditLine,
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

test("payment receipt names the bills covered, leftover credit, balance and statement link", () => {
	const lines = buildPaymentReceiptSummary({
		firstName: "Oliver",
		amountCents: 24900,
		receivedAt: received,
		covered: [gas, cleaners],
		creditCents: 5000,
		balanceCents: 12000,
	}).split("\n");
	assert.equal(lines[0], "*Thanks Oliver, payment received*");
	assert.equal(lines[1], "$249.00 on Sat, 12 Sep");
	assert.equal(lines[3], "Covers:");
	assert.equal(lines[4], "- Gas (due 12 Sep) · $100.00");
	assert.equal(lines[5], "- Cleaners (due 15 Sep) · $99.00");
	assert.equal(lines[7], "$50.00 is held as credit for your next bill.");
	assert.equal(lines[8], "You still owe $120.00.");
	assert.equal(lines.length, 9);
});

test("credit-held receipt says the money waits for the next bill and has no statement line", () => {
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
			"$50.00 on Sat, 12 Sep",
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
			"$100.00 on Sat, 12 Sep",
			"",
			"Previously covered:",
			"- Gas (due 12 Sep) · $100.00",
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
	assert.equal(reallocated[6], "- Cleaners (due 15 Sep) · $99.00");
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
	assert.equal(lines[1], '$420.00 on Sat, 12 Sep · "Rent"');
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
	assert.equal(none[1], "$10.00 on Sat, 12 Sep · no reference");
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

test("reminders name applied credit and the amount left to pay", () => {
	assert.equal(
		buildBillReminderSummary({
			payUrl: "https://bills.example/pay/abc",
			credit: { creditCents: 5000, receivedAt: received, toPayCents: 7000 },
		}),
		"$50.00 credit from your 12 Sep payment is applied, $70.00 to pay\nhttps://bills.example/pay/abc",
	);
	assert.equal(
		buildCreditLine({ creditCents: 12000, receivedAt: null, toPayCents: 0 }),
		"$120.00 credit covers this, nothing to pay",
	);
	assert.equal(
		buildBillReminderSummary({
			payUrl: "https://bills.example/pay/abc",
			credit: null,
		}),
		"https://bills.example/pay/abc",
	);
});
