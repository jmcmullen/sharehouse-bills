import { z } from "zod";

export const BILL_REMINDER_WEEKDAY_OPTIONS = [
	{ value: 0, label: "Sunday" },
	{ value: 1, label: "Monday" },
	{ value: 2, label: "Tuesday" },
	{ value: 3, label: "Wednesday" },
	{ value: 4, label: "Thursday" },
	{ value: 5, label: "Friday" },
	{ value: 6, label: "Saturday" },
] as const;

export type BillReminderMode = "individual" | "stacked";
export type BillReminderOverdueCadence = "none" | "daily" | "weekly";

export type BillReminderConfig = {
	remindersEnabled: boolean;
	reminderMode: BillReminderMode;
	stackGroup: string | null;
	preDueOffsetsDays: number[];
	overdueCadence: BillReminderOverdueCadence;
	overdueWeekday: number | null;
};

export const DEFAULT_BILL_REMINDER_CONFIG: BillReminderConfig = {
	remindersEnabled: true,
	reminderMode: "individual",
	stackGroup: null,
	preDueOffsetsDays: [1, 0],
	overdueCadence: "weekly",
	overdueWeekday: 2,
};

export type BillReminderDefaultsInput = {
	billerName?: string | null;
	billType?:
		| "electricity"
		| "gas"
		| "internet"
		| "phone"
		| "water"
		| "other"
		| null;
	templateName?: string | null;
};

function isValidWeekday(value: number) {
	return Number.isInteger(value) && value >= 0 && value <= 6;
}

export function normalizePreDueOffsetsDays(
	offsets: number[] | null | undefined,
) {
	if (!offsets) {
		return [...DEFAULT_BILL_REMINDER_CONFIG.preDueOffsetsDays];
	}

	return [...new Set(offsets)]
		.filter((offset) => Number.isInteger(offset) && offset >= 0)
		.sort((left, right) => right - left);
}

export function normalizeStackGroup(value: string | null | undefined) {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

export function normalizeBillReminderConfig(
	input: Partial<BillReminderConfig> | null | undefined,
): BillReminderConfig {
	const remindersEnabled =
		input?.remindersEnabled ?? DEFAULT_BILL_REMINDER_CONFIG.remindersEnabled;
	const reminderMode =
		input?.reminderMode ?? DEFAULT_BILL_REMINDER_CONFIG.reminderMode;
	const stackGroup =
		reminderMode === "stacked" ? normalizeStackGroup(input?.stackGroup) : null;
	const overdueCadence =
		input?.overdueCadence ?? DEFAULT_BILL_REMINDER_CONFIG.overdueCadence;
	const overdueWeekday =
		overdueCadence === "weekly" &&
		input?.overdueWeekday !== undefined &&
		input.overdueWeekday !== null
			? isValidWeekday(input.overdueWeekday)
				? input.overdueWeekday
				: DEFAULT_BILL_REMINDER_CONFIG.overdueWeekday
			: overdueCadence === "weekly"
				? 2
				: null;

	return {
		remindersEnabled,
		reminderMode,
		stackGroup,
		preDueOffsetsDays:
			reminderMode === "individual"
				? normalizePreDueOffsetsDays(input?.preDueOffsetsDays)
				: [],
		overdueCadence,
		overdueWeekday,
	};
}

export function getDefaultBillReminderConfig(
	input: BillReminderDefaultsInput | null | undefined,
) {
	const normalizedBillType = input?.billType?.trim().toLowerCase() ?? null;
	const searchText = [
		input?.billerName?.trim().toLowerCase() ?? "",
		input?.templateName?.trim().toLowerCase() ?? "",
	]
		.filter(Boolean)
		.join(" ");

	if (searchText.includes("rent")) {
		return normalizeBillReminderConfig({
			remindersEnabled: true,
			reminderMode: "individual",
			stackGroup: null,
			preDueOffsetsDays: [2, 1, 0],
			overdueCadence: "daily",
			overdueWeekday: null,
		});
	}

	if (normalizedBillType === "electricity" || normalizedBillType === "gas") {
		return normalizeBillReminderConfig({
			remindersEnabled: true,
			reminderMode: "stacked",
			stackGroup: "utilities",
			preDueOffsetsDays: [],
			overdueCadence: "weekly",
			overdueWeekday: 2,
		});
	}

	return normalizeBillReminderConfig(DEFAULT_BILL_REMINDER_CONFIG);
}

export const billReminderConfigInputSchema = z
	.object({
		remindersEnabled: z.boolean(),
		reminderMode: z.enum(["individual", "stacked"]),
		stackGroup: z.string().trim().nullable(),
		preDueOffsetsDays: z.array(z.number().int().min(0)),
		overdueCadence: z.enum(["none", "daily", "weekly"]),
		overdueWeekday: z.number().int().min(0).max(6).nullable(),
	})
	.transform((input) => normalizeBillReminderConfig(input))
	.superRefine((input, context) => {
		if (
			input.remindersEnabled &&
			input.reminderMode === "stacked" &&
			!input.stackGroup
		) {
			context.addIssue({
				code: "custom",
				message: "Stacked reminders require a stack group",
				path: ["stackGroup"],
			});
		}

		if (
			input.remindersEnabled &&
			input.overdueCadence === "weekly" &&
			input.overdueWeekday === null
		) {
			context.addIssue({
				code: "custom",
				message: "Weekly reminders require a weekday",
				path: ["overdueWeekday"],
			});
		}
	});

export function parseReminderOffsetsInput(value: string) {
	const trimmed = value.trim();
	if (!trimmed) {
		return [];
	}

	return normalizePreDueOffsetsDays(
		trimmed
			.split(",")
			.map((part) => Number.parseInt(part.trim(), 10))
			.filter((offset) => !Number.isNaN(offset)),
	);
}

export function formatReminderOffsetsInput(offsets: number[]) {
	return normalizePreDueOffsetsDays(offsets).join(", ");
}

export function toBillReminderDbValues(config: BillReminderConfig) {
	return {
		remindersEnabled: config.remindersEnabled,
		reminderMode: config.reminderMode,
		stackGroup: config.stackGroup,
		preDueOffsetsDays: config.preDueOffsetsDays,
		overdueCadence: config.overdueCadence,
		overdueWeekday: config.overdueWeekday,
	};
}

export function formatReminderConfigSummary(config: BillReminderConfig) {
	function formatPreDueOffsets(offsets: number[]) {
		if (offsets.length === 0) {
			return "No pre-due reminders";
		}

		return offsets
			.map((offset) => {
				if (offset === 0) {
					return "on the due date";
				}

				if (offset === 1) {
					return "1 day before";
				}

				return `${offset} days before`;
			})
			.join(", ");
	}

	function formatOverdueRule() {
		if (config.overdueCadence === "daily") {
			return "daily if overdue";
		}

		if (config.overdueCadence === "weekly") {
			return `${
				BILL_REMINDER_WEEKDAY_OPTIONS.find(
					(option) => option.value === config.overdueWeekday,
				)?.label ?? "Tuesday"
			}s if overdue`;
		}

		return "no overdue reminders";
	}

	if (!config.remindersEnabled) {
		return "Reminders off";
	}

	if (config.reminderMode === "stacked") {
		return `Grouped in ${config.stackGroup ?? "this group"}: ${formatOverdueRule()}`;
	}

	return `${formatPreDueOffsets(config.preDueOffsetsDays)}; ${formatOverdueRule()}`;
}
