import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.server";
import { bills } from "../db/schema/bills";
import { recurringBills } from "../db/schema/recurring-bills";

function formatDate(value: Date | null) {
	return value?.toISOString().slice(0, 10) ?? "null";
}

const templates = await db.select().from(recurringBills);
const repairs: Array<{
	templateName: string;
	previousLastGeneratedDate: string;
	nextLastGeneratedDate: string;
}> = [];

for (const template of templates) {
	const [latestBill] = await db
		.select({ dueDate: bills.dueDate })
		.from(bills)
		.where(eq(bills.recurringBillId, template.id))
		.orderBy(desc(bills.dueDate))
		.limit(1);
	const latestBillDueDate = latestBill?.dueDate ?? null;

	if (
		(template.lastGeneratedDate?.getTime() ?? null) ===
		(latestBillDueDate?.getTime() ?? null)
	) {
		continue;
	}

	await db
		.update(recurringBills)
		.set({
			lastGeneratedDate: latestBillDueDate,
			updatedAt: new Date(),
		})
		.where(eq(recurringBills.id, template.id));

	repairs.push({
		templateName: template.templateName,
		previousLastGeneratedDate: formatDate(template.lastGeneratedDate),
		nextLastGeneratedDate: formatDate(latestBillDueDate),
	});
}

if (repairs.length === 0) {
	console.log("Recurring bill lastGeneratedDate values already match bills.");
} else {
	console.table(repairs);
	console.log(`Repaired ${repairs.length} recurring bill template(s).`);
}
