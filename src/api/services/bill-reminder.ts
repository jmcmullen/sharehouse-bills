import { and, asc, eq } from "drizzle-orm";
import {
	type BillReminderConfig,
	normalizeBillReminderConfig,
} from "../../lib/bill-reminder-config";
import { db } from "../db/index.server";
import { bills } from "../db/schema/bills";
import { debts } from "../db/schema/debts";
import { housemates } from "../db/schema/housemates";
import { enqueueBillReminderNotification } from "./whatsapp-notification-events";

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

function startOfUtcDay(date: Date) {
	return new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
	);
}

function addUtcDays(date: Date, days: number) {
	return new Date(startOfUtcDay(date).getTime() + days * ONE_DAY_IN_MS);
}

function isSameUtcDay(left: Date, right: Date) {
	return startOfUtcDay(left).getTime() === startOfUtcDay(right).getTime();
}

export function isIndividualReminderDueToday(input: {
	targetDate: Date;
	dueDate: Date;
	config: BillReminderConfig;
}) {
	for (const offset of input.config.preDueOffsetsDays) {
		if (isSameUtcDay(input.targetDate, addUtcDays(input.dueDate, -offset))) {
			return "pre_due" as const;
		}
	}

	const today = startOfUtcDay(input.targetDate);
	const dueDate = startOfUtcDay(input.dueDate);
	if (today.getTime() <= dueDate.getTime()) {
		return null;
	}

	if (input.config.overdueCadence === "daily") {
		return "overdue" as const;
	}

	if (
		input.config.overdueCadence === "weekly" &&
		input.config.overdueWeekday !== null &&
		today.getUTCDay() === input.config.overdueWeekday
	) {
		return "overdue" as const;
	}

	return null;
}

export function isStackedReminderDueToday(input: {
	targetDate: Date;
	dueDate: Date;
	config: BillReminderConfig;
}) {
	const today = startOfUtcDay(input.targetDate);
	const dueDate = startOfUtcDay(input.dueDate);
	if (today.getTime() <= dueDate.getTime()) {
		return false;
	}

	if (input.config.overdueCadence === "daily") {
		return true;
	}

	return (
		input.config.overdueCadence === "weekly" &&
		input.config.overdueWeekday !== null &&
		today.getUTCDay() === input.config.overdueWeekday
	);
}

export async function enqueueDueBillReminders(targetDate: Date) {
	const scheduledForDate = startOfUtcDay(targetDate);
	const scheduledForDateIso = scheduledForDate.toISOString();
	const rows = await db
		.select({
			billId: bills.id,
			billerName: bills.billerName,
			dueDate: bills.dueDate,
			housemateId: housemates.id,
			whatsappNumber: housemates.whatsappNumber,
			remindersEnabled: bills.remindersEnabled,
			reminderMode: bills.reminderMode,
			stackGroup: bills.stackGroup,
			preDueOffsetsDays: bills.preDueOffsetsDays,
			overdueCadence: bills.overdueCadence,
			overdueWeekday: bills.overdueWeekday,
		})
		.from(debts)
		.innerJoin(bills, eq(bills.id, debts.billId))
		.innerJoin(housemates, eq(housemates.id, debts.housemateId))
		.where(and(eq(debts.isPaid, false), eq(bills.remindersEnabled, true)))
		.orderBy(asc(bills.dueDate), asc(debts.id));

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
