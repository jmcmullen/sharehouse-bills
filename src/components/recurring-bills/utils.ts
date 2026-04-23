import {
	formatReminderOffsetsInput,
	parseReminderOffsetsInput,
} from "@/lib/bill-reminder-config";
import { getEqualSplitAmounts } from "@/lib/equal-split";
import type {
	HousemateOption,
	RecurringBillFormData,
	RecurringBillListItem,
	RecurringBillPreviewSummary,
} from "./types";

const WEEKDAY_OPTIONS = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
] as const;

function toDate(value: string | Date | null | undefined) {
	if (!value) {
		return null;
	}

	return value instanceof Date ? value : new Date(value);
}

function startOfUtcDay(date: Date) {
	return new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
	);
}

function addDays(date: Date, days: number) {
	return new Date(startOfUtcDay(date).getTime() + days * 24 * 60 * 60 * 1000);
}

function daysInMonth(year: number, monthIndex: number) {
	return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function clampDayOfMonth(year: number, monthIndex: number, dayOfMonth: number) {
	return Math.min(dayOfMonth, daysInMonth(year, monthIndex));
}

function buildUtcDate(year: number, monthIndex: number, dayOfMonth: number) {
	return new Date(Date.UTC(year, monthIndex, dayOfMonth));
}

function getNextDueDateForForm(formData: RecurringBillFormData) {
	const startDate = toDate(formData.startDate);
	if (!startDate) {
		return null;
	}

	const today = startOfUtcDay(new Date());
	const baseDate = startOfUtcDay(
		new Date(Math.max(startOfUtcDay(startDate).getTime(), today.getTime())),
	);

	if (formData.frequency === "weekly") {
		const dayOfWeek = Number.parseInt(formData.dayOfWeek, 10);
		if (Number.isNaN(dayOfWeek)) {
			return null;
		}

		return addDays(baseDate, (dayOfWeek - baseDate.getUTCDay() + 7) % 7);
	}

	if (formData.frequency === "monthly") {
		const dayOfMonth = Number.parseInt(formData.dayOfMonth, 10);
		if (Number.isNaN(dayOfMonth)) {
			return null;
		}

		const thisMonthDate = buildUtcDate(
			baseDate.getUTCFullYear(),
			baseDate.getUTCMonth(),
			clampDayOfMonth(
				baseDate.getUTCFullYear(),
				baseDate.getUTCMonth(),
				dayOfMonth,
			),
		);

		if (thisMonthDate.getTime() >= baseDate.getTime()) {
			return thisMonthDate;
		}

		const nextMonthIndex =
			baseDate.getUTCMonth() === 11 ? 0 : baseDate.getUTCMonth() + 1;
		const nextMonthYear =
			baseDate.getUTCMonth() === 11
				? baseDate.getUTCFullYear() + 1
				: baseDate.getUTCFullYear();

		return buildUtcDate(
			nextMonthYear,
			nextMonthIndex,
			clampDayOfMonth(nextMonthYear, nextMonthIndex, dayOfMonth),
		);
	}

	const anniversaryMonth = startDate.getUTCMonth();
	const anniversaryDay = startDate.getUTCDate();
	const thisYearDate = buildUtcDate(
		baseDate.getUTCFullYear(),
		anniversaryMonth,
		clampDayOfMonth(
			baseDate.getUTCFullYear(),
			anniversaryMonth,
			anniversaryDay,
		),
	);

	if (thisYearDate.getTime() >= baseDate.getTime()) {
		return thisYearDate;
	}

	const nextYear = baseDate.getUTCFullYear() + 1;
	return buildUtcDate(
		nextYear,
		anniversaryMonth,
		clampDayOfMonth(nextYear, anniversaryMonth, anniversaryDay),
	);
}

export function formatCurrency(amount: number) {
	return new Intl.NumberFormat("en-AU", {
		style: "currency",
		currency: "AUD",
	}).format(amount);
}

export function formatDate(value: string | Date | null | undefined) {
	const date = toDate(value);
	if (!date) {
		return "Not scheduled";
	}

	return new Intl.DateTimeFormat("en-AU", {
		day: "numeric",
		month: "short",
		year: "numeric",
	}).format(date);
}

export function toDateInputValue(value: string | Date | null | undefined) {
	const date = toDate(value);
	if (!date) {
		return "";
	}

	return date.toISOString().slice(0, 10);
}

export function getFrequencyLabel(frequency: "weekly" | "monthly" | "yearly") {
	return frequency.charAt(0).toUpperCase() + frequency.slice(1);
}

export function getScheduleSummary(item: RecurringBillListItem) {
	const template = item.template;
	if (template.frequency === "weekly" && template.dayOfWeek !== null) {
		return `Every ${WEEKDAY_OPTIONS[template.dayOfWeek]}`;
	}

	if (template.frequency === "monthly" && template.dayOfMonth !== null) {
		return `Day ${template.dayOfMonth} of each month`;
	}

	return "Every year on start date anniversary";
}

export function buildEmptyRecurringBillFormData(
	housemates: HousemateOption[],
): RecurringBillFormData {
	return {
		id: null,
		templateName: "",
		billerName: "",
		totalAmount: "",
		frequency: "weekly",
		dayOfWeek: "4",
		dayOfMonth: "1",
		startDate: toDateInputValue(new Date()),
		endDate: "",
		isActive: true,
		splitStrategy: "equal",
		remindersEnabled: true,
		reminderMode: "individual",
		stackGroup: "",
		preDueOffsetsInput: "1, 0",
		overdueCadence: "weekly",
		overdueWeekday: "2",
		assignments: housemates.map((housemate) => ({
			housemateId: housemate.id,
			name: housemate.name,
			isOwner: housemate.isOwner,
			isActive: true,
			customAmount: "",
		})),
	};
}

export function buildRecurringBillFormData(
	item: RecurringBillListItem,
	housemates: HousemateOption[],
): RecurringBillFormData {
	const assignmentLookup = new Map(
		item.assignments.map((assignment) => [assignment.housemateId, assignment]),
	);

	return {
		id: item.template.id,
		templateName: item.template.templateName,
		billerName: item.template.billerName,
		totalAmount: String(item.template.totalAmount),
		frequency: item.template.frequency,
		dayOfWeek:
			item.template.dayOfWeek === null ? "" : String(item.template.dayOfWeek),
		dayOfMonth:
			item.template.dayOfMonth === null ? "" : String(item.template.dayOfMonth),
		startDate: toDateInputValue(item.template.startDate),
		endDate: toDateInputValue(item.template.endDate),
		isActive: item.template.isActive,
		splitStrategy: item.template.splitStrategy,
		remindersEnabled: item.template.remindersEnabled,
		reminderMode: item.template.reminderMode,
		stackGroup: item.template.stackGroup ?? "",
		preDueOffsetsInput: formatReminderOffsetsInput(
			item.template.preDueOffsetsDays,
		),
		overdueCadence: item.template.overdueCadence,
		overdueWeekday:
			item.template.overdueWeekday === null
				? "2"
				: String(item.template.overdueWeekday),
		assignments: housemates.map((housemate) => {
			const assignment = assignmentLookup.get(housemate.id);
			return {
				housemateId: housemate.id,
				name: housemate.name,
				isOwner: housemate.isOwner,
				isActive: assignment?.isActive ?? false,
				customAmount:
					assignment?.customAmount === null ||
					assignment?.customAmount === undefined
						? ""
						: String(assignment.customAmount),
			};
		}),
	};
}

export function validateRecurringBillForm(formData: RecurringBillFormData) {
	if (!formData.templateName.trim()) {
		return "Template name is required";
	}

	if (!formData.billerName.trim()) {
		return "Biller name is required";
	}

	const totalAmount = Number.parseFloat(formData.totalAmount);
	if (Number.isNaN(totalAmount) || totalAmount <= 0) {
		return "Total amount must be greater than zero";
	}

	if (formData.frequency === "weekly" && formData.dayOfWeek === "") {
		return "Weekly recurring bills require a weekday";
	}

	if (formData.frequency === "monthly" && formData.dayOfMonth === "") {
		return "Monthly recurring bills require a day of month";
	}

	const activeAssignments = formData.assignments.filter(
		(assignment) => assignment.isActive,
	);
	if (activeAssignments.length === 0) {
		return "Select at least one active housemate";
	}

	if (formData.splitStrategy === "custom") {
		const hasOwner = activeAssignments.some((assignment) => assignment.isOwner);
		let customTotal = 0;
		for (const assignment of activeAssignments) {
			if (assignment.isOwner) {
				continue;
			}

			const customAmount = Number.parseFloat(assignment.customAmount);
			if (Number.isNaN(customAmount) || customAmount < 0) {
				return `Custom amount required for ${assignment.name}`;
			}

			customTotal += customAmount;
		}

		if (customTotal - totalAmount > 0.01) {
			return "Custom amounts cannot exceed the total amount";
		}

		if (!hasOwner && Math.abs(customTotal - totalAmount) > 0.01) {
			return "Custom amounts must match the total amount unless an owner is included";
		}
	}

	if (
		formData.remindersEnabled &&
		formData.reminderMode === "stacked" &&
		!formData.stackGroup.trim()
	) {
		return "Stacked reminders require a stack group";
	}

	if (
		formData.remindersEnabled &&
		formData.overdueCadence === "weekly" &&
		formData.overdueWeekday === ""
	) {
		return "Weekly reminders require a weekday";
	}

	return null;
}

export function getRecurringReminderConfigPayload(
	formData: RecurringBillFormData,
) {
	return {
		remindersEnabled: formData.remindersEnabled,
		reminderMode: formData.reminderMode,
		stackGroup: formData.stackGroup.trim() || null,
		preDueOffsetsDays:
			formData.reminderMode === "individual"
				? parseReminderOffsetsInput(formData.preDueOffsetsInput)
				: [],
		overdueCadence: formData.overdueCadence,
		overdueWeekday:
			formData.overdueCadence === "weekly"
				? Number.parseInt(formData.overdueWeekday, 10)
				: null,
	} as const;
}

export function calculateRecurringBillPreview(
	formData: RecurringBillFormData,
): RecurringBillPreviewSummary {
	const totalAmount = Number.parseFloat(formData.totalAmount) || 0;
	const includedAssignments = formData.assignments.filter(
		(assignment) => assignment.isActive,
	);

	if (includedAssignments.length === 0) {
		return {
			includedCount: 0,
			amountPerPerson: null,
			ownerShare: totalAmount,
			nonOwnerTotal: 0,
			assignments: [],
		};
	}

	if (formData.splitStrategy === "equal") {
		const { amountPerDebtor, ownerShareTotal } = getEqualSplitAmounts({
			totalAmount,
			participantCount: includedAssignments.length,
			ownerCount: includedAssignments.filter((assignment) => assignment.isOwner)
				.length,
		});
		const assignments = includedAssignments.map((assignment) => ({
			housemateId: assignment.housemateId,
			name: assignment.name,
			isOwner: assignment.isOwner,
			isActive: true,
			amountOwed: assignment.isOwner ? 0 : amountPerDebtor,
			customAmount: null,
		}));

		return {
			includedCount: includedAssignments.length,
			amountPerPerson: amountPerDebtor,
			ownerShare: ownerShareTotal,
			nonOwnerTotal: assignments.reduce(
				(sum, assignment) => sum + assignment.amountOwed,
				0,
			),
			assignments,
		};
	}

	const assignments = includedAssignments.map((assignment) => {
		const parsedCustomAmount = assignment.isOwner
			? null
			: Number.parseFloat(assignment.customAmount);
		const customAmount =
			parsedCustomAmount === null || Number.isNaN(parsedCustomAmount)
				? null
				: parsedCustomAmount;
		const amountOwed = assignment.isOwner ? 0 : (customAmount ?? 0);

		return {
			housemateId: assignment.housemateId,
			name: assignment.name,
			isOwner: assignment.isOwner,
			isActive: true,
			amountOwed,
			customAmount,
		};
	});
	const nonOwnerTotal = assignments.reduce(
		(sum, assignment) => sum + assignment.amountOwed,
		0,
	);

	return {
		includedCount: includedAssignments.length,
		amountPerPerson: null,
		ownerShare: totalAmount - nonOwnerTotal,
		nonOwnerTotal,
		assignments,
	};
}

export function getFormScheduleSummary(formData: RecurringBillFormData) {
	if (formData.frequency === "weekly" && formData.dayOfWeek !== "") {
		return `Every ${WEEKDAY_OPTIONS[Number.parseInt(formData.dayOfWeek, 10)]}`;
	}

	if (formData.frequency === "monthly" && formData.dayOfMonth !== "") {
		return `Day ${formData.dayOfMonth} of each month`;
	}

	return "Every year on the start date anniversary";
}

export function getNextDueDatePreview(formData: RecurringBillFormData) {
	return getNextDueDateForForm(formData);
}
