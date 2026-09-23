import assert from "node:assert/strict";
import { test } from "node:test";
import {
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
