import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/index.server";
import { bills } from "../db/schema/bills";
import { debts } from "../db/schema/debts";
import { recurringBills } from "../db/schema/recurring-bills";
import { coverShares } from "./bill-reminder-credit";
import { getCredit } from "./ledger/credit.server";

async function getUnpaidShareRows(housemateId: string) {
	return await db
		.select({
			billId: bills.id,
			housemateId: debts.housemateId,
			billerName: bills.billerName,
			billType: bills.billType,
			recurringTemplateName: recurringBills.templateName,
			stackGroup: bills.stackGroup,
			dueDate: bills.dueDate,
			billPeriodStart: bills.billPeriodStart,
			billPeriodEnd: bills.billPeriodEnd,
			amountOwed: debts.amountOwed,
			amountPaid: debts.amountPaid,
		})
		.from(debts)
		.innerJoin(bills, eq(bills.id, debts.billId))
		.leftJoin(recurringBills, eq(recurringBills.id, bills.recurringBillId))
		.where(and(eq(debts.housemateId, housemateId), eq(debts.isPaid, false)))
		.orderBy(asc(bills.dueDate), asc(debts.id));
}

export type CoveredShare = Awaited<
	ReturnType<typeof getCoveredShares>
>["shares"][number];

// Every unpaid share the housemate has, oldest due first, with their credit
// applied in that order. The pay page and the reminders both read this, so a
// bill is never covered on one and chased on the other.
export async function getCoveredShares(housemateId: string) {
	const [rows, credit] = await Promise.all([
		getUnpaidShareRows(housemateId),
		getCredit(housemateId),
	]);
	return {
		credit,
		shares: coverShares(rows, new Map([[housemateId, credit]])),
	};
}
