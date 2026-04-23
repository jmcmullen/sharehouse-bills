import { and, asc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { createError } from "evlog";
import { toBillReminderDbValues } from "../../lib/bill-reminder-config";
import { getEqualSplitAmounts } from "../../lib/equal-split";
import { getRequestLogger } from "../../lib/request-logger";
import { db } from "../db/index.server";
import { bills } from "../db/schema/bills";
import { debts } from "../db/schema/debts";
import { housemates } from "../db/schema/housemates";
import { recurringBillAssignments } from "../db/schema/recurring-bill-assignments";
import { recurringBills } from "../db/schema/recurring-bills";
import {
	applyHousemateCreditToDebt,
	roundCurrency,
} from "./debt-payment-state";
import { enqueueBillCreatedNotification } from "./whatsapp-notification-events";

type RecurringBillRecord = typeof recurringBills.$inferSelect;

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

export interface RecurringAssignmentPreview {
	housemateId: string;
	name: string;
	isOwner: boolean;
	customAmount: number | null;
	amountOwed: number;
}

export interface RecurringBillPreview {
	nextDueDate: Date | null;
	assignments: RecurringAssignmentPreview[];
	ownerShare: number;
}

function startOfUtcDay(date: Date) {
	return new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
	);
}

function addUtcDays(date: Date, days: number) {
	return new Date(startOfUtcDay(date).getTime() + days * ONE_DAY_IN_MS);
}

function getDaysInUtcMonth(year: number, monthIndex: number) {
	return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function clampDayOfMonth(year: number, monthIndex: number, dayOfMonth: number) {
	return Math.min(dayOfMonth, getDaysInUtcMonth(year, monthIndex));
}

function buildUtcDate(year: number, monthIndex: number, dayOfMonth: number) {
	return new Date(Date.UTC(year, monthIndex, dayOfMonth));
}

function normalizeRecurringDate(date: Date | null | undefined) {
	return date ? startOfUtcDay(new Date(date)) : null;
}

function isSameOrBeforeDay(left: Date, right: Date) {
	return startOfUtcDay(left).getTime() <= startOfUtcDay(right).getTime();
}

function getNextWeeklyOccurrence(
	recurringBill: RecurringBillRecord,
	fromDate: Date,
) {
	if (recurringBill.dayOfWeek === null) {
		return null;
	}

	const baseDate = startOfUtcDay(
		new Date(
			Math.max(
				startOfUtcDay(fromDate).getTime(),
				startOfUtcDay(recurringBill.startDate).getTime(),
			),
		),
	);
	const daysUntilTarget =
		(recurringBill.dayOfWeek - baseDate.getUTCDay() + 7) % 7;
	return addUtcDays(baseDate, daysUntilTarget);
}

function getNextMonthlyOccurrence(
	recurringBill: RecurringBillRecord,
	fromDate: Date,
) {
	if (recurringBill.dayOfMonth === null) {
		return null;
	}

	const baseDate = startOfUtcDay(
		new Date(
			Math.max(
				startOfUtcDay(fromDate).getTime(),
				startOfUtcDay(recurringBill.startDate).getTime(),
			),
		),
	);
	const dayOfMonth = recurringBill.dayOfMonth;
	const thisMonthDate = buildUtcDate(
		baseDate.getUTCFullYear(),
		baseDate.getUTCMonth(),
		clampDayOfMonth(
			baseDate.getUTCFullYear(),
			baseDate.getUTCMonth(),
			dayOfMonth,
		),
	);
	if (isSameOrBeforeDay(baseDate, thisMonthDate)) {
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

function getNextYearlyOccurrence(
	recurringBill: RecurringBillRecord,
	fromDate: Date,
) {
	const startDate = startOfUtcDay(recurringBill.startDate);
	const baseDate = startOfUtcDay(
		new Date(Math.max(startOfUtcDay(fromDate).getTime(), startDate.getTime())),
	);
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
	if (isSameOrBeforeDay(baseDate, thisYearDate)) {
		return thisYearDate;
	}

	return buildUtcDate(
		baseDate.getUTCFullYear() + 1,
		anniversaryMonth,
		clampDayOfMonth(
			baseDate.getUTCFullYear() + 1,
			anniversaryMonth,
			anniversaryDay,
		),
	);
}

export function getNextDueDate(
	recurringBill: RecurringBillRecord,
	fromDate: Date = new Date(),
) {
	const normalizedFromDate = startOfUtcDay(fromDate);
	const normalizedEndDate = normalizeRecurringDate(recurringBill.endDate);
	let candidate: Date | null = null;

	switch (recurringBill.frequency) {
		case "weekly":
			candidate = getNextWeeklyOccurrence(recurringBill, normalizedFromDate);
			break;
		case "monthly":
			candidate = getNextMonthlyOccurrence(recurringBill, normalizedFromDate);
			break;
		case "yearly":
			candidate = getNextYearlyOccurrence(recurringBill, normalizedFromDate);
			break;
		default:
			candidate = null;
	}

	if (!candidate) {
		return null;
	}

	if (
		normalizedEndDate &&
		startOfUtcDay(candidate).getTime() > normalizedEndDate.getTime()
	) {
		return null;
	}

	return candidate;
}

function getNextDueDateAfterLastGenerated(recurringBill: RecurringBillRecord) {
	const referenceDate = recurringBill.lastGeneratedDate
		? addUtcDays(recurringBill.lastGeneratedDate, 1)
		: recurringBill.startDate;

	return getNextDueDate(recurringBill, referenceDate);
}

async function getExistingBillForDueDate(
	recurringBillId: string,
	dueDate: Date,
) {
	const [existingBill] = await db
		.select({ id: bills.id })
		.from(bills)
		.where(
			and(
				eq(bills.recurringBillId, recurringBillId),
				eq(bills.dueDate, startOfUtcDay(dueDate)),
			),
		)
		.limit(1);

	return existingBill ?? null;
}

async function getActiveAssignments(recurringBillId: string) {
	return await db
		.select({
			housemateId: recurringBillAssignments.housemateId,
			customAmount: recurringBillAssignments.customAmount,
			isOwner: housemates.isOwner,
			name: housemates.name,
		})
		.from(recurringBillAssignments)
		.innerJoin(
			housemates,
			eq(recurringBillAssignments.housemateId, housemates.id),
		)
		.where(
			and(
				eq(recurringBillAssignments.recurringBillId, recurringBillId),
				eq(recurringBillAssignments.isActive, true),
				eq(housemates.isActive, true),
			),
		)
		.orderBy(asc(housemates.name));
}

function validateCustomAssignments(
	recurringBill: RecurringBillRecord,
	assignments: Awaited<ReturnType<typeof getActiveAssignments>>,
) {
	const ownerAssignments = assignments.filter(
		(assignment) => assignment.isOwner,
	);
	const nonOwnerAssignments = assignments.filter(
		(assignment) => !assignment.isOwner,
	);

	for (const assignment of nonOwnerAssignments) {
		if (assignment.customAmount === null) {
			throw createError({
				message: "Custom amount required for recurring bill assignment",
				status: 422,
				why: `${assignment.name} is missing a custom amount on ${recurringBill.templateName}.`,
				fix: "Set a custom amount for every non-owner assignment when using custom split strategy.",
			});
		}
	}

	const totalAssigned = roundCurrency(
		nonOwnerAssignments.reduce(
			(sum, assignment) => sum + (assignment.customAmount ?? 0),
			0,
		),
	);

	if (totalAssigned > recurringBill.totalAmount + 0.01) {
		throw createError({
			message: "Custom amounts exceed recurring bill total",
			status: 422,
			why: `Assigned custom amounts exceed the total amount for ${recurringBill.templateName}.`,
			fix: "Reduce the assigned custom amounts so they do not exceed the recurring bill total.",
		});
	}

	if (
		ownerAssignments.length === 0 &&
		Math.abs(totalAssigned - recurringBill.totalAmount) > 0.01
	) {
		throw createError({
			message: "Custom amounts must equal recurring bill total",
			status: 422,
			why: `Assigned custom amounts do not match the total amount for ${recurringBill.templateName}.`,
			fix: "Adjust the custom amounts so they add up exactly to the recurring bill total when there is no owner share.",
		});
	}
}

export async function previewRecurringBill(
	recurringBill: RecurringBillRecord,
): Promise<RecurringBillPreview> {
	const nextDueDate = getNextDueDateAfterLastGenerated(recurringBill);
	const assignments = await getActiveAssignments(recurringBill.id);

	if (assignments.length === 0) {
		return {
			nextDueDate,
			assignments: [],
			ownerShare: recurringBill.totalAmount,
		};
	}

	if (recurringBill.splitStrategy === "equal") {
		const { amountPerDebtor, ownerShareTotal } = getEqualSplitAmounts({
			totalAmount: recurringBill.totalAmount,
			participantCount: assignments.length,
			ownerCount: assignments.filter((assignment) => assignment.isOwner).length,
		});
		const previews = assignments.map((assignment) => ({
			housemateId: assignment.housemateId,
			name: assignment.name,
			isOwner: assignment.isOwner,
			customAmount: assignment.customAmount,
			amountOwed: assignment.isOwner ? 0 : amountPerDebtor,
		}));

		return {
			nextDueDate,
			assignments: previews,
			ownerShare: ownerShareTotal,
		};
	}

	validateCustomAssignments(recurringBill, assignments);
	const nonOwnerAssignments = assignments.filter(
		(assignment) => !assignment.isOwner,
	);
	const totalAssigned = roundCurrency(
		nonOwnerAssignments.reduce(
			(sum, assignment) => sum + (assignment.customAmount ?? 0),
			0,
		),
	);

	return {
		nextDueDate,
		assignments: assignments.map((assignment) => ({
			housemateId: assignment.housemateId,
			name: assignment.name,
			isOwner: assignment.isOwner,
			customAmount: assignment.customAmount,
			amountOwed: assignment.isOwner ? 0 : (assignment.customAmount ?? 0),
		})),
		ownerShare: roundCurrency(recurringBill.totalAmount - totalAssigned),
	};
}

async function generateBillFromTemplate(
	recurringBill: RecurringBillRecord,
	dueDate: Date,
): Promise<string | null> {
	const log = getRequestLogger();
	try {
		const activeAssignments = await getActiveAssignments(recurringBill.id);
		if (activeAssignments.length === 0) {
			throw createError({
				message: "No active assignments found for recurring bill",
				status: 500,
				why: `No active assignments exist for ${recurringBill.templateName}.`,
				fix: "Add at least one active assignment before generating this recurring bill.",
			});
		}

		const [newBill] = await db
			.insert(bills)
			.values({
				billerName: recurringBill.billerName,
				totalAmount: recurringBill.totalAmount,
				dueDate: startOfUtcDay(dueDate),
				recurringBillId: recurringBill.id,
				pdfUrl: null,
				sourceFilename: recurringBill.templateName,
				...toBillReminderDbValues({
					remindersEnabled: recurringBill.remindersEnabled,
					reminderMode: recurringBill.reminderMode,
					stackGroup: recurringBill.stackGroup,
					preDueOffsetsDays: recurringBill.preDueOffsetsDays,
					overdueCadence: recurringBill.overdueCadence,
					overdueWeekday: recurringBill.overdueWeekday,
				}),
			})
			.returning({ id: bills.id });

		const nonOwnerAssignments = activeAssignments.filter(
			(assignment) => !assignment.isOwner,
		);
		if (nonOwnerAssignments.length === 0) {
			throw createError({
				message: "No active non-owner assignments found for recurring bill",
				status: 500,
				why: `${recurringBill.templateName} only creates debts for non-owner assignments, but none are active.`,
				fix: "Add at least one active non-owner assignment before generating this recurring bill.",
			});
		}
		let debtEntries: Array<{
			billId: string;
			housemateId: string;
			amountOwed: number;
			amountPaid: number;
			isPaid: boolean;
		}> = [];

		if (recurringBill.splitStrategy === "equal") {
			const { amountPerDebtor } = getEqualSplitAmounts({
				totalAmount: recurringBill.totalAmount,
				participantCount: activeAssignments.length,
				ownerCount: activeAssignments.length - nonOwnerAssignments.length,
			});
			debtEntries = nonOwnerAssignments.map((assignment) => ({
				billId: newBill.id,
				housemateId: assignment.housemateId,
				amountOwed: amountPerDebtor,
				amountPaid: 0,
				isPaid: false,
			}));
		} else {
			validateCustomAssignments(recurringBill, activeAssignments);
			debtEntries = nonOwnerAssignments.map((assignment) => ({
				billId: newBill.id,
				housemateId: assignment.housemateId,
				amountOwed: roundCurrency(assignment.customAmount ?? 0),
				amountPaid: 0,
				isPaid: false,
			}));
		}

		if (debtEntries.length > 0) {
			const insertedDebts = await db
				.insert(debts)
				.values(debtEntries)
				.returning({
					id: debts.id,
					housemateId: debts.housemateId,
				});
			for (const debtRecord of insertedDebts) {
				await applyHousemateCreditToDebt(debtRecord.housemateId, debtRecord.id);
			}
		}
		log?.set({
			recurringBillGeneration: {
				recurringBillId: recurringBill.id,
				templateName: recurringBill.templateName,
				billId: newBill.id,
				debtRecordCount: debtEntries.length,
				splitStrategy: recurringBill.splitStrategy,
				dueDate: startOfUtcDay(dueDate).toISOString(),
			},
		});
		await enqueueBillCreatedNotification(newBill.id, "recurring");

		await db
			.update(recurringBills)
			.set({
				lastGeneratedDate: startOfUtcDay(dueDate),
				updatedAt: new Date(),
			})
			.where(eq(recurringBills.id, recurringBill.id));

		return newBill.id;
	} catch (error) {
		log?.error(error instanceof Error ? error : String(error), {
			recurringBillGeneration: {
				recurringBillId: recurringBill.id,
				templateName: recurringBill.templateName,
			},
		});
		return null;
	}
}

export async function generateRecurringBillById(recurringBillId: string) {
	const log = getRequestLogger();
	log?.set({
		recurringBillGeneration: {
			recurringBillId,
		},
	});
	const [recurringBill] = await db
		.select()
		.from(recurringBills)
		.where(eq(recurringBills.id, recurringBillId))
		.limit(1);

	if (!recurringBill) {
		throw createError({
			message: "Recurring bill template not found",
			status: 404,
			why: `No recurring bill template exists with id ${recurringBillId}.`,
			fix: "Use a valid recurring bill template ID.",
		});
	}

	if (!recurringBill.isActive) {
		throw createError({
			message: "Recurring bill template is paused",
			status: 409,
			why: `${recurringBill.templateName} is not active.`,
			fix: "Resume the recurring bill template before generating a bill.",
		});
	}

	const nextDueDate = getNextDueDateAfterLastGenerated(recurringBill);
	if (!nextDueDate) {
		throw createError({
			message: "Recurring bill has no upcoming due date",
			status: 422,
			why: `${recurringBill.templateName} has no due date after the last generated period.`,
			fix: "Check the recurring schedule, start date, and end date configuration.",
		});
	}
	log?.set({
		recurringBillGeneration: {
			recurringBillId,
			templateName: recurringBill.templateName,
			nextDueDate: nextDueDate.toISOString(),
		},
	});

	const existingBill = await getExistingBillForDueDate(
		recurringBill.id,
		nextDueDate,
	);
	if (existingBill) {
		log?.set({
			recurringBillGeneration: {
				recurringBillId,
				templateName: recurringBill.templateName,
				existingBillId: existingBill.id,
			},
		});
		return { billId: existingBill.id, dueDate: nextDueDate, duplicate: true };
	}

	const billId = await generateBillFromTemplate(recurringBill, nextDueDate);
	if (!billId) {
		throw createError({
			message: "Failed to generate recurring bill",
			status: 500,
			why: `The recurring bill template ${recurringBill.templateName} could not be generated.`,
			fix: "Inspect recurring bill assignments and prior wide-event context for the failing generation step.",
		});
	}

	return { billId, dueDate: nextDueDate, duplicate: false };
}

export async function generateDueBills(targetDate: Date = new Date()): Promise<{
	generated: number;
	bills: Array<{ recurringBillId: string; billId: string }>;
}> {
	const log = getRequestLogger();
	log?.set({
		recurringBills: {
			targetDate: startOfUtcDay(targetDate).toISOString(),
		},
	});
	const activeRecurringBills = await db
		.select()
		.from(recurringBills)
		.where(
			and(
				eq(recurringBills.isActive, true),
				lte(recurringBills.startDate, startOfUtcDay(targetDate)),
				or(
					isNull(recurringBills.endDate),
					gte(recurringBills.endDate, startOfUtcDay(targetDate)),
				),
			),
		);
	log?.set({
		recurringBills: {
			targetDate: startOfUtcDay(targetDate).toISOString(),
			activeTemplateCount: activeRecurringBills.length,
		},
	});

	const generatedBills: Array<{ recurringBillId: string; billId: string }> = [];

	for (const recurringBill of activeRecurringBills) {
		const nextDueDate = getNextDueDateAfterLastGenerated(recurringBill);
		if (
			!nextDueDate ||
			startOfUtcDay(nextDueDate).getTime() > startOfUtcDay(targetDate).getTime()
		) {
			continue;
		}

		const existingBill = await getExistingBillForDueDate(
			recurringBill.id,
			nextDueDate,
		);
		if (existingBill) {
			continue;
		}

		const billId = await generateBillFromTemplate(recurringBill, nextDueDate);
		if (billId) {
			generatedBills.push({ recurringBillId: recurringBill.id, billId });
		}
	}
	log?.set({
		recurringBills: {
			targetDate: startOfUtcDay(targetDate).toISOString(),
			generatedCount: generatedBills.length,
		},
	});

	return { generated: generatedBills.length, bills: generatedBills };
}

export function getNextThursday(fromDate: Date = new Date()) {
	const date = startOfUtcDay(fromDate);
	const daysUntilThursday = (4 - date.getUTCDay() + 7) % 7;
	return addUtcDays(date, daysUntilThursday === 0 ? 7 : daysUntilThursday);
}

export async function generateWeeklyRentBill(): Promise<string | null> {
	const [rentTemplate] = await db
		.select()
		.from(recurringBills)
		.where(
			and(
				eq(recurringBills.templateName, "Weekly Rent"),
				eq(recurringBills.isActive, true),
			),
		)
		.limit(1);

	if (!rentTemplate) {
		throw createError({
			message: "Weekly rent template not found",
			status: 404,
			why: "No active recurring bill template named Weekly Rent exists.",
			fix: "Create or reactivate a Weekly Rent recurring bill template before generating rent.",
		});
	}

	const result = await generateRecurringBillById(rentTemplate.id);
	return result.billId;
}
