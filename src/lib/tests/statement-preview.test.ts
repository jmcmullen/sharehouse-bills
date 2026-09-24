import assert from "node:assert/strict";
import { test } from "node:test";
import { statementPreview } from "../statement-preview";

test("statement preview states the balance and uses the owing palette when money is owed", () => {
	const preview = statementPreview({
		name: "Oliver Caprile",
		headline: { label: "You owe", amount: 663.97 },
		monthCount: 6,
	});
	assert.equal(preview.title, "Oliver's statement");
	assert.equal(
		preview.description,
		"You owe $663.97. Every bill and payment, month by month.",
	);
	assert.equal(preview.card.primaryValue, "$663.97");
	assert.equal(preview.card.secondaryValue, "You owe");
	assert.equal(preview.card.tertiaryValue, "6 months of bills and payments");
	assert.equal(preview.card.backgroundColor, "#1f221b");
});

test("credit and settled statements use the settled palette", () => {
	const credit = statementPreview({
		name: "Sarah O'Dwyer",
		headline: { label: "In credit", amount: 2557.99 },
		monthCount: 1,
	});
	assert.equal(credit.card.primaryValue, "$2,557.99");
	assert.equal(credit.card.secondaryValue, "In credit");
	assert.equal(credit.card.tertiaryValue, "1 month of bills and payments");
	assert.equal(credit.card.backgroundColor, "#0d1f14");
	const sorted = statementPreview({
		name: "Matthew Blair",
		headline: { label: "All sorted", amount: 0 },
		monthCount: 5,
	});
	assert.equal(sorted.card.primaryValue, "All sorted");
	assert.equal(sorted.card.secondaryValue, "Statement");
	assert.equal(
		sorted.description,
		"All sorted. Every bill and payment, month by month.",
	);
});
