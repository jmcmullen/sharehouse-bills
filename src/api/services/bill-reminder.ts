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

type ReminderPreviewEntry =
	| {
			mode: "individual";
			kind: "pre_due" | "overdue";
			debts: [ReminderDebtPreview];
	  }
	| {
			mode: "stacked";
			kind: "overdue";
			stackGroup: string;
			debts: ReminderDebtPreview[];
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

function collectReminderPreviewByHousemate(
	rows: ReminderCandidateRow[],
	targetDate: Date,
) {
	const previews = new Map<string, RandomBillReminderPreview>();
	const stackedGroups = new Map<
		string,
		{
			housemateId: string;
			stackGroup: string;
			debts: ReminderDebtPreview[];
		}
	>();

	for (const row of rows) {
		if (!row.whatsappNumber) {
			continue;
		}

		const config = normalizeBillReminderConfig({
			remindersEnabled: row.remindersEnabled,
			reminderMode: row.reminderMode,
			stackGroup: row.stackGroup,
			preDueOffsetsDays: row.preDueOffsetsDays,
			overdueCadence: row.overdueCadence,
			overdueWeekday: row.overdueWeekday,
		});
		if (!config.remindersEnabled) {
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

		if (config.reminderMode === "individual") {
			const kind = isIndividualReminderDueToday({
				targetDate,
				dueDate: row.dueDate,
				config,
			});
			if (!kind) {
				continue;
			}

			preview.reminders.push({
				mode: "individual",
				kind,
				debts: [toReminderDebtPreview(row)],
			});
			previews.set(row.housemateId, preview);
			continue;
		}

		if (!config.stackGroup) {
			continue;
		}

		if (
			!isStackedReminderDueToday({
				targetDate,
				dueDate: row.dueDate,
				config,
			})
		) {
			continue;
		}

		const groupKey = `${row.housemateId}:${config.stackGroup}`;
		const existingGroup = stackedGroups.get(groupKey);
		if (existingGroup) {
			existingGroup.debts.push(toReminderDebtPreview(row));
		} else {
			stackedGroups.set(groupKey, {
				housemateId: row.housemateId,
				stackGroup: config.stackGroup,
				debts: [toReminderDebtPreview(row)],
			});
		}
		previews.set(row.housemateId, preview);
	}

	for (const group of stackedGroups.values()) {
		const preview = previews.get(group.housemateId);
		if (!preview) {
			continue;
		}

		preview.reminders.push({
			mode: "stacked",
			kind: "overdue",
			stackGroup: group.stackGroup,
			debts: group.debts,
		});
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
	const stackedGroups = new Map<
		string,
		{
			housemateId: string;
			stackGroup: string;
		}
	>();

	for (const row of rows) {
		if (!row.whatsappNumber) {
			continue;
		}

		const config = normalizeBillReminderConfig({
			remindersEnabled: row.remindersEnabled,
			reminderMode: row.reminderMode,
			stackGroup: row.stackGroup,
			preDueOffsetsDays: row.preDueOffsetsDays,
			overdueCadence: row.overdueCadence,
			overdueWeekday: row.overdueWeekday,
		});
		if (!config.remindersEnabled) {
			continue;
		}

		if (config.reminderMode === "individual") {
			const kind = isIndividualReminderDueToday({
				targetDate: scheduledForDate,
				dueDate: row.dueDate,
				config,
			});
			if (!kind) {
				continue;
			}

			await enqueueBillReminderNotification({
				eventKey: `bill-reminder:individual:${row.billId}:${row.housemateId}:${scheduledForDateIso}`,
				billId: row.billId,
				housemateId: row.housemateId,
				payload: {
					mode: "individual",
					kind,
					scheduledForDate: scheduledForDateIso,
				},
			});
			scheduledCount += 1;
			continue;
		}

		if (!config.stackGroup) {
			continue;
		}

		if (
			!isStackedReminderDueToday({
				targetDate: scheduledForDate,
				dueDate: row.dueDate,
				config,
			})
		) {
			continue;
		}

		stackedGroups.set(`${row.housemateId}:${config.stackGroup}`, {
			housemateId: row.housemateId,
			stackGroup: config.stackGroup,
		});
	}

	for (const group of stackedGroups.values()) {
		await enqueueBillReminderNotification({
			eventKey: `bill-reminder:stacked:${group.housemateId}:${group.stackGroup}:${scheduledForDateIso}`,
			housemateId: group.housemateId,
			payload: {
				mode: "stacked",
				kind: "overdue",
				scheduledForDate: scheduledForDateIso,
				stackGroup: group.stackGroup,
			},
		});
		scheduledCount += 1;
	}

	return {
		scheduledCount,
		stackedGroupCount: stackedGroups.size,
		checkedDebtCount: rows.length,
	};
}
