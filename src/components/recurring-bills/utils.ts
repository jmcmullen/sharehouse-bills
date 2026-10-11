// fallow-ignore-file code-duplication
import { getEqualSplitCents } from "@/lib/equal-split";
import { formatDecimal, parseCents } from "@/lib/money";
import type {
	HousemateOption,
	RecurringBillFormData,
	RecurringBillListItem,
	RecurringBillPreviewSummary,
} from "./types";

type RecurringBillAssignmentFormData =
	RecurringBillFormData["assignments"][number];

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

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

function daysInMonth(year: number, monthIndex: number) {
	return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function clampDayOfMonth(year: number, monthIndex: number, dayOfMonth: number) {
	return Math.min(dayOfMonth, daysInMonth(year, monthIndex));
}

function buildUtcDate(year: number, monthIndex: number, dayOfMonth: number) {
	return new Date(Date.UTC(year, monthIndex, dayOfMonth));
}

function getBaseDueDate(startDate: Date) {
	const today = startOfUtcDay(new Date());
	return startOfUtcDay(
		new Date(Math.max(startOfUtcDay(startDate).getTime(), today.getTime())),
	);
}

function getNextWeeklyDueDate(baseDate: Date, dayOfWeek: number) {
	return addDays(baseDate, (dayOfWeek - baseDate.getUTCDay() + 7) % 7);
}

function getNextFortnightlyDueDate(
	startDate: Date,
	baseDate: Date,
	dayOfWeek: number,
) {
	const normalizedStartDate = startOfUtcDay(startDate);
	const firstOccurrence = addDays(
		normalizedStartDate,
		(dayOfWeek - normalizedStartDate.getUTCDay() + 7) % 7,
	);

	if (firstOccurrence.getTime() >= baseDate.getTime()) {
		return firstOccurrence;
	}

	return addDays(
		firstOccurrence,
		Math.ceil(
			(baseDate.getTime() - firstOccurrence.getTime()) / (14 * ONE_DAY_IN_MS),
		) * 14,
	);
}

function getNextWeekdayDueDate(
	formData: RecurringBillFormData,
	startDate: Date,
	baseDate: Date,
) {
	const dayOfWeek = Number.parseInt(formData.dayOfWeek, 10);
	if (Number.isNaN(dayOfWeek)) {
		return null;
	}

	if (formData.frequency === "fortnightly") {
		return getNextFortnightlyDueDate(startDate, baseDate, dayOfWeek);
	}

	return getNextWeeklyDueDate(baseDate, dayOfWeek);
}

function getNextMonthlyDueDate(baseDate: Date, dayOfMonth: number) {
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

function getNextYearlyDueDate(startDate: Date, baseDate: Date) {
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

function getNextDueDateForForm(formData: RecurringBillFormData) {
	const startDate = toDate(formData.startDate);
	if (!startDate) {
		return null;
	}

	const baseDate = getBaseDueDate(startDate);

	if (formData.frequency === "weekly" || formData.frequency === "fortnightly") {
		return getNextWeekdayDueDate(formData, startDate, baseDate);
	}

	if (formData.frequency === "monthly") {
		const dayOfMonth = Number.parseInt(formData.dayOfMonth, 10);
		if (Number.isNaN(dayOfMonth)) {
			return null;
		}

		return getNextMonthlyDueDate(baseDate, dayOfMonth);
	}

	return getNextYearlyDueDate(startDate, baseDate);
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

function toDateInputValue(value: string | Date | null | undefined) {
	const date = toDate(value);
	if (!date) {
		return "";
	}

	return date.toISOString().slice(0, 10);
}

export function getFrequencyLabel(
	frequency: RecurringBillFormData["frequency"],
) {
	return frequency.charAt(0).toUpperCase() + frequency.slice(1);
}

export function getScheduleSummary(item: RecurringBillListItem) {
	const template = item.template;
	if (template.frequency === "weekly" && template.dayOfWeek !== null) {
		return `Every ${WEEKDAY_OPTIONS[template.dayOfWeek]}`;
	}

	if (template.frequency === "fortnightly" && template.dayOfWeek !== null) {
		return `Every second ${WEEKDAY_OPTIONS[template.dayOfWeek]}`;
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
		totalDollars: "",
		frequency: "weekly",
		dayOfWeek: "4",
		dayOfMonth: "1",
		startDate: toDateInputValue(new Date()),
		endDate: "",
		isActive: true,
		splitStrategy: "equal",
		stackGroup: "",
		assignments: housemates.map((housemate) => ({
			housemateId: housemate.id,
			name: housemate.name,
			isOwner: housemate.isOwner,
			isActive: true,
			customDollars: "",
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
		totalDollars: formatDecimal(item.template.totalCents),
		frequency: item.template.frequency,
		dayOfWeek:
			item.template.dayOfWeek === null ? "" : String(item.template.dayOfWeek),
		dayOfMonth:
			item.template.dayOfMonth === null ? "" : String(item.template.dayOfMonth),
		startDate: toDateInputValue(item.template.startDate),
		endDate: toDateInputValue(item.template.endDate),
		isActive: item.template.isActive,
		splitStrategy: item.template.splitStrategy,
		stackGroup: item.template.stackGroup ?? "",
		assignments: housemates.map((housemate) => {
			const assignment = assignmentLookup.get(housemate.id);
			return {
				housemateId: housemate.id,
				name: housemate.name,
				isOwner: housemate.isOwner,
				isActive: assignment?.isActive ?? false,
				customDollars:
					assignment?.customCents === null ||
					assignment?.customCents === undefined
						? ""
						: formatDecimal(assignment.customCents),
			};
		}),
	};
}

export function validateRecurringBillForm(formData: RecurringBillFormData) {
	const totalCents = parseCents(formData.totalDollars);
	const activeAssignments = formData.assignments.filter(
		(assignment) => assignment.isActive,
	);

	return (
		validateRecurringBillBasics(formData, totalCents) ??
		validateRecurringBillAssignments({
			activeAssignments,
			splitStrategy: formData.splitStrategy,
			totalCents: totalCents ?? 0,
		})
	);
}

function validateRecurringBillBasics(
	formData: RecurringBillFormData,
	totalCents: number | null,
) {
	if (!formData.templateName.trim()) {
		return "Template name is required";
	}

	if (!formData.billerName.trim()) {
		return "Biller name is required";
	}

	if (totalCents === null || totalCents <= 0) {
		return "Total amount must be greater than zero";
	}

	if (
		(formData.frequency === "weekly" || formData.frequency === "fortnightly") &&
		formData.dayOfWeek === ""
	) {
		return "Weekly and fortnightly recurring bills require a weekday";
	}

	if (formData.frequency === "monthly" && formData.dayOfMonth === "") {
		return "Monthly recurring bills require a day of month";
	}

	return null;
}

function validateRecurringBillAssignments(input: {
	activeAssignments: RecurringBillAssignmentFormData[];
	splitStrategy: RecurringBillFormData["splitStrategy"];
	totalCents: number;
}) {
	if (input.activeAssignments.length === 0) {
		return "Select at least one active housemate";
	}

	if (input.splitStrategy !== "custom") {
		return null;
	}

	return validateCustomRecurringAssignments(
		input.activeAssignments,
		input.totalCents,
	);
}

function validateCustomRecurringAssignments(
	activeAssignments: RecurringBillAssignmentFormData[],
	totalCents: number,
) {
	const hasOwner = activeAssignments.some((assignment) => assignment.isOwner);
	const missing = activeAssignments.find((assignment) => {
		const cents = parseCents(assignment.customDollars);
		return !assignment.isOwner && (cents === null || cents < 0);
	});
	if (missing) {
		return `Custom amount required for ${missing.name}`;
	}

	const customCents = customTotalCents(activeAssignments);
	if (customCents > totalCents) {
		return "Custom amounts cannot exceed the total amount";
	}

	if (!hasOwner && customCents !== totalCents) {
		return "Custom amounts must match the total amount unless an owner is included";
	}

	return null;
}

function customCentsFor(assignment: RecurringBillAssignmentFormData) {
	return assignment.isOwner ? null : parseCents(assignment.customDollars);
}

function customTotalCents(assignments: RecurringBillAssignmentFormData[]) {
	return assignments.reduce(
		(total, assignment) => total + (customCentsFor(assignment) ?? 0),
		0,
	);
}

export function calculateRecurringBillPreview(
	formData: RecurringBillFormData,
): RecurringBillPreviewSummary {
	const totalCents = parseCents(formData.totalDollars) ?? 0;
	const included = formData.assignments.filter(
		(assignment) => assignment.isActive,
	);

	if (included.length === 0) {
		return {
			includedCount: 0,
			perPersonCents: null,
			ownerShareCents: totalCents,
			nonOwnerCents: 0,
			assignments: [],
		};
	}

	const preview = (
		amountCents: (assignment: RecurringBillAssignmentFormData) => number,
		customCents: (assignment: RecurringBillAssignmentFormData) => number | null,
	) =>
		included.map((assignment) => ({
			housemateId: assignment.housemateId,
			name: assignment.name,
			isOwner: assignment.isOwner,
			isActive: true,
			amountCents: assignment.isOwner ? 0 : amountCents(assignment),
			customCents: customCents(assignment),
		}));

	if (formData.splitStrategy === "equal") {
		const { perDebtorCents, ownerShareCents } = getEqualSplitCents({
			totalCents,
			participantCount: included.length,
			ownerCount: included.filter((assignment) => assignment.isOwner).length,
		});
		return {
			includedCount: included.length,
			perPersonCents: perDebtorCents,
			ownerShareCents,
			nonOwnerCents: totalCents - ownerShareCents,
			assignments: preview(
				() => perDebtorCents,
				() => null,
			),
		};
	}

	const nonOwnerCents = customTotalCents(included);
	return {
		includedCount: included.length,
		perPersonCents: null,
		ownerShareCents: totalCents - nonOwnerCents,
		nonOwnerCents,
		assignments: preview(
			(assignment) => customCentsFor(assignment) ?? 0,
			customCentsFor,
		),
	};
}

export function getFormScheduleSummary(formData: RecurringBillFormData) {
	if (formData.frequency === "weekly" && formData.dayOfWeek !== "") {
		return `Every ${WEEKDAY_OPTIONS[Number.parseInt(formData.dayOfWeek, 10)]}`;
	}

	if (formData.frequency === "fortnightly" && formData.dayOfWeek !== "") {
		return `Every second ${
			WEEKDAY_OPTIONS[Number.parseInt(formData.dayOfWeek, 10)]
		}`;
	}

	if (formData.frequency === "monthly" && formData.dayOfMonth !== "") {
		return `Day ${formData.dayOfMonth} of each month`;
	}

	return "Every year on the start date anniversary";
}

export function getNextDueDatePreview(formData: RecurringBillFormData) {
	return getNextDueDateForForm(formData);
}
