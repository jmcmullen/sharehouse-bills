import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDecimal, parseCents } from "../money";

test("cents print as the two-decimal text inputs and fingerprints use", () => {
	const cases: Array<[number, string]> = [
		[0, "0.00"],
		[5, "0.05"],
		[12350, "123.50"],
		[186575, "1865.75"],
		[-150, "-1.50"],
	];
	for (const [cents, text] of cases) {
		assert.equal(formatDecimal(cents), text);
		assert.equal(parseCents(text), cents);
	}
});
