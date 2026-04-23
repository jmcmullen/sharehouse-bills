import type { BillReminderConfig } from "./bill-reminder-config";

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

export function getReminderScheduledForDate(targetDate: Date) {
	return startOfUtcDay(targetDate);
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
