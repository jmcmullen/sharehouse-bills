import assert from "node:assert/strict";
import { test } from "node:test";
import { paidPercentage } from "../payment-progress";

test("progress is by amount and only reaches 100% when settled", () => {
	assert.equal(paidPercentage(1864.6, 1865.75), 99);
	assert.equal(paidPercentage(1865.75, 1865.75), 100);
	assert.equal(paidPercentage(1865.746, 1865.75), 100);
	assert.equal(paidPercentage(746.3, 1865.75), 40);
	assert.equal(paidPercentage(0, 100), 0);
	assert.equal(paidPercentage(0, 0), 100);
	assert.equal(paidPercentage(0.4, 100), 0);
});
