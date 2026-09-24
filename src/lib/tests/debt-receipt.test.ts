import assert from "node:assert/strict";
import { test } from "node:test";
import { formatReceiptTiming } from "../debt-receipt";

test("a receipt card names the share's due date and how early it was paid", () => {
	const now = new Date("2026-09-24T02:00:00Z");
	assert.equal(
		formatReceiptTiming(
			{
				dueDate: "2026-09-18T00:00:00.000Z",
				paidAt: "2026-09-15T03:00:00.000Z",
			},
			now,
		),
		"Due Fri 18 Sep · 3 days early",
	);
	assert.equal(
		formatReceiptTiming(
			{
				dueDate: "2026-03-03T00:00:00.000Z",
				paidAt: "2026-03-03T09:00:00.000Z",
			},
			now,
		),
		"Due Tue 3 Mar · on the due date",
	);
});
