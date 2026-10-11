import assert from "node:assert/strict";
import { test } from "node:test";
import { coverShares } from "../account/compute";
import { summarizeUnpaidBills } from "../unpaid-bills";

const day = (date: string) =>
	Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
const share = (
	housemateId: string,
	billId: string,
	dueDate: string,
	amountCents: number,
	paidCents = 0,
) => ({
	id: `${housemateId}-${billId}`,
	billId,
	name: billId,
	billType: billId === "Gas" ? ("gas" as const) : ("other" as const),
	dueAt: day(dueDate),
	remainingCents: amountCents - paidCents,
});
const oliver = [
	share("oliver", "Rent", "2026-09-20", 10000),
	share("oliver", "Water", "2026-10-01", 4000, 1000),
	share("oliver", "Gas", "2026-10-20", 6000),
];
const sarah = [
	share("sarah", "Rent", "2026-09-20", 10000),
	share("sarah", "Gas", "2026-10-20", 6000),
];
const covered = (creditCents: number) => [
	...coverShares(oliver, creditCents),
	...coverShares(sarah, 0),
];

test("current unpaid bills drop shares held credit covers and bills it settles", () => {
	const before = summarizeUnpaidBills(covered(0));
	assert.equal(before.totalOutstandingCents, 35000);
	assert.deepEqual(
		before.bills.map((bill) => [bill.billerName, bill.remainingCents]),
		[
			["Rent", 20000],
			["Water", 3000],
			["Gas", 12000],
		],
	);
	const after = summarizeUnpaidBills(covered(13000));
	assert.equal(after.totalOutstandingCents, 22000);
	assert.deepEqual(
		after.bills.map((bill) => [bill.billerName, bill.remainingCents]),
		[
			["Rent", 10000],
			["Gas", 12000],
		],
	);
});

test("electricity bills fold into one line with a bill count", () => {
	const power = (billId: string, due: string) => ({
		...share("oliver", billId, due, 5000),
		billType: "electricity" as const,
	});
	const result = summarizeUnpaidBills(
		coverShares(
			[power("AGL Sep", "2026-09-01"), power("AGL Oct", "2026-10-01")],
			0,
		),
	);
	assert.deepEqual(
		result.bills.map((bill) => [
			bill.billerName,
			bill.remainingCents,
			bill.billCount,
		]),
		[["Electricity", 10000, 2]],
	);
});
