import { and, asc, eq } from "drizzle-orm";
import {
	type BillReminderConfig,
	normalizeBillReminderConfig,
} from "../../lib/bill-reminder-config";
import {
	getReminderScheduledForDate,
	isIndividualReminderDueToday,
	isStackedReminderDueToday,
} from "../../lib/bill-reminder-schedule";
import { db } from "../db/index.server";
import { bills } from "../db/schema/bills";
import { debts } from "../db/schema/debts";
import { housemates } from "../db/schema/housemates";
import { recurringBills } from "../db/schema/recurring-bills";
import { enqueueBillReminderNotification } from "./whatsapp-notification-events";

type ReminderDebtPreview = {
	billId: string;
	billerName: string;
	recurringTemplateName: string | null;
	dueDate: Date;
	amountOwed: number;
	amountPaid: number | null;
};

type ReminderCandidateRow = {
	billId: string;
	billerName: string;
	recurringTemplateName: string | null;
	dueDate: Date;
	housemateId: string;
	housemateName: string;
	whatsappNumber: string | null;
	amountOwed: number;
	amountPaid: number | null;
	remindersEnabled: boolean;
	reminderMode: BillReminderConfig["reminderMode"];
	stackGroup: string | null;
	preDueOffsetsDays: number[];
	overdueCadence: BillReminderConfig["overdueCadence"];
	overdueWeekday: number | null;
};

type ReminderPreviewEntry = {
	kind: "pre_due" | "overdue";
	debt: ReminderDebtPreview;
};

export type RandomBillReminderPreview = {
	housemate: {
		id: string;
		name: string;
		whatsappNumber: string;
	};
	reminders: ReminderPreviewEntry[];
	scheduledForDate: Date;
};

async function getReminderCandidateRows() {
	return await db
		.select({
			billId: bills.id,
			billerName: bills.billerName,
			recurringTemplateName: recurringBills.templateName,
			dueDate: bills.dueDate,
			housemateId: housemates.id,
			housemateName: housemates.name,
			whatsappNumber: housemates.whatsappNumber,
			amountOwed: debts.amountOwed,
			amountPaid: debts.amountPaid,
			remindersEnabled: bills.remindersEnabled,
			reminderMode: bills.reminderMode,
			stackGroup: bills.stackGroup,
			preDueOffsetsDays: bills.preDueOffsetsDays,
			overdueCadence: bills.overdueCadence,
			overdueWeekday: bills.overdueWeekday,
		})
		.from(debts)
		.innerJoin(bills, eq(bills.id, debts.billId))
		.leftJoin(recurringBills, eq(recurringBills.id, bills.recurringBillId))
		.innerJoin(housemates, eq(housemates.id, debts.housemateId))
		.where(and(eq(debts.isPaid, false), eq(bills.remindersEnabled, true)))
		.orderBy(asc(bills.dueDate), asc(debts.id));
}

function toReminderDebtPreview(row: ReminderCandidateRow): ReminderDebtPreview {
	return {
		billId: row.billId,
		billerName: row.billerName,
		recurringTemplateName: row.recurringTemplateName,
		dueDate: row.dueDate,
		amountOwed: row.amountOwed,
		amountPaid: row.amountPaid,
	};
}

function getReminderKindForRow(input: {
	row: ReminderCandidateRow;
	targetDate: Date;
}) {
	const config = normalizeBillReminderConfig({
		remindersEnabled: input.row.remindersEnabled,
		reminderMode: input.row.reminderMode,
		stackGroup: input.row.stackGroup,
		preDueOffsetsDays: input.row.preDueOffsetsDays,
		overdueCadence: input.row.overdueCadence,
		overdueWeekday: input.row.overdueWeekday,
	});
	if (!config.remindersEnabled) {
		return null;
	}

	if (config.reminderMode === "individual") {
		return isIndividualReminderDueToday({
			targetDate: input.targetDate,
			dueDate: input.row.dueDate,
			config,
		});
	}

	if (!config.stackGroup) {
		return null;
	}

	return isStackedReminderDueToday({
		targetDate: input.targetDate,
		dueDate: input.row.dueDate,
		config,
	})
		? "overdue"
		: null;
}

function collectReminderPreviewByHousemate(
	rows: ReminderCandidateRow[],
	targetDate: Date,
) {
	const previews = new Map<string, RandomBillReminderPreview>();

	for (const row of rows) {
		if (!row.whatsappNumber) {
			continue;
		}

		const kind = getReminderKindForRow({ row, targetDate });
		if (!kind) {
			continue;
		}
		const preview =
			previews.get(row.housemateId) ??
			({
				housemate: {
					id: row.housemateId,
					name: row.housemateName,
					whatsappNumber: row.whatsappNumber,
				},
				reminders: [],
				scheduledForDate: getReminderScheduledForDate(targetDate),
			} satisfies RandomBillReminderPreview);

		preview.reminders.push({
			kind,
			debt: toReminderDebtPreview(row),
		});
		previews.set(row.housemateId, preview);
	}

	return [...previews.values()].filter(
		(preview) => preview.reminders.length > 0,
	);
}

export async function getRandomBillReminderPreview(targetDate: Date) {
	const previews = collectReminderPreviewByHousemate(
		await getReminderCandidateRows(),
		targetDate,
	);
	if (previews.length === 0) {
		return null;
	}

	return previews[Math.floor(Math.random() * previews.length)] ?? null;
}

export async function enqueueDueBillReminders(targetDate: Date) {
	const scheduledForDate = getReminderScheduledForDate(targetDate);
	const scheduledForDateIso = scheduledForDate.toISOString();
	const rows = await getReminderCandidateRows();

	let scheduledCount = 0;

	for (const row of rows) {
		if (!row.whatsappNumber) {
			continue;
		}

		const kind = getReminderKindForRow({
			row,
			targetDate: scheduledForDate,
		});
		if (!kind) {
			continue;
		}

		await enqueueBillReminderNotification({
			eventKey: `bill-reminder:${row.billId}:${row.housemateId}:${scheduledForDateIso}`,
			billId: row.billId,
			housemateId: row.housemateId,
			payload: {
				mode: "individual",
				kind,
				scheduledForDate: scheduledForDateIso,
			},
		});
		scheduledCount += 1;
	}

	return {
		scheduledCount,
		stackedGroupCount: 0,
		checkedDebtCount: rows.length,
	};
}
