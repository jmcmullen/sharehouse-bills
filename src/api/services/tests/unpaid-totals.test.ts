import assert from "node:assert/strict";
import { test } from "node:test";
import { coverShares } from "../bill-reminder-credit";
import {
	overdueCents,
	summarizeUnpaidBills,
	toPayCents,
} from "../unpaid-totals";

const day = (date: string) => new Date(`${date}T00:00:00Z`);
const now = day("2026-10-11");
const share = (
	housemateId: string,
	billId: string,
	dueDate: string,
	amountOwed: number,
	amountPaid = 0,
) => ({
	housemateId,
	billId,
	billerName: billId,
	billType: billId === "Gas" ? ("gas" as const) : ("other" as const),
	dueDate: day(dueDate),
	amountOwed,
	amountPaid,
});
const oliver = [
	share("oliver", "Rent", "2026-09-20", 100),
	share("oliver", "Water", "2026-10-01", 40, 10),
	share("oliver", "Gas", "2026-10-20", 60),
];
const sarah = [
	share("sarah", "Rent", "2026-09-20", 100),
	share("sarah", "Gas", "2026-10-20", 60),
];
const covered = (rows: ReturnType<typeof share>[], creditCents: number) =>
	coverShares(
		rows,
		new Map([
			["oliver", { amountCents: creditCents }],
			["sarah", { amountCents: 0 }],
		]),
	);

test("overdue balances leave out what held credit already covers", () => {
	assert.equal(overdueCents(covered(oliver, 0), now), 13000);
	assert.equal(overdueCents(covered(oliver, 12000), now), 1000);
	assert.equal(overdueCents(covered(oliver, 50000), now), 0);
});

test("the pay link amount is what is left after held credit", () => {
	assert.equal(toPayCents(covered(oliver, 0)), 19000);
	assert.equal(toPayCents(covered(oliver, 12000)), 7000);
	assert.equal(toPayCents(covered(oliver, 50000)), 0);
});

test("current unpaid bills drop shares held credit covers and bills it settles", () => {
	const before = summarizeUnpaidBills(covered([...oliver, ...sarah], 0));
	assert.equal(before.totalOutstanding, 350);
	assert.deepEqual(
		before.bills.map((bill) => [bill.billerName, bill.remainingAmount]),
		[
			["Rent", 200],
			["Water", 30],
			["Gas", 120],
		],
	);
	const after = summarizeUnpaidBills(covered([...oliver, ...sarah], 13000));
	assert.equal(after.totalOutstanding, 220);
	assert.deepEqual(
		after.bills.map((bill) => [bill.billerName, bill.remainingAmount]),
		[
			["Rent", 100],
			["Gas", 120],
		],
	);
});
