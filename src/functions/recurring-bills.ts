import { createServerFn } from "@tanstack/react-start";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../api/db";
import { bills } from "../api/db/schema/bills";
import { housemates } from "../api/db/schema/housemates";
import { recurringBillAssignments } from "../api/db/schema/recurring-bill-assignments";
import { recurringBills } from "../api/db/schema/recurring-bills";
import {
	generateRecurringBillById,
	getNextDueDate,
	previewRecurringBill,
} from "../api/services/recurring-bill";
import { authMiddleware } from "../lib/auth-middleware";

const recurringBillAssignmentInputSchema = z.object({
	housemateId: z.number(),
	isActive: z.boolean(),
	customAmount: z.number().min(0).nullable(),
});

const recurringBillInputObjectSchema = z.object({
	templateName: z.string().min(1),
	billerName: z.string().min(1),
	totalAmount: z.number().positive(),
	frequency: z.enum(["weekly", "monthly", "yearly"]),
	dayOfWeek: z.number().min(0).max(6).nullable(),
	dayOfMonth: z.number().min(1).max(31).nullable(),
	startDate: z.string().min(1),
	endDate: z.string().nullable(),
	isActive: z.boolean(),
	splitStrategy: z.enum(["equal", "custom"]),
	assignments: z.array(recurringBillAssignmentInputSchema).min(1),
});

function validateRecurringBillInput(
	value: z.infer<typeof recurringBillInputObjectSchema>,
	context: z.RefinementCtx,
) {
	if (value.frequency === "weekly" && value.dayOfWeek === null) {
		context.addIssue({
			code: "custom",
			message: "Weekly recurring bills require a weekday",
			path: ["dayOfWeek"],
		});
	}

	if (value.frequency === "monthly" && value.dayOfMonth === null) {
		context.addIssue({
			code: "custom",
			message: "Monthly recurring bills require a day of month",
			path: ["dayOfMonth"],
		});
	}

	if (
		value.endDate &&
		new Date(value.endDate).getTime() < new Date(value.startDate).getTime()
	) {
		context.addIssue({
			code: "custom",
			message: "End date must be after start date",
			path: ["endDate"],
		});
	}
}

const recurringBillInputSchema = recurringBillInputObjectSchema.superRefine(
	validateRecurringBillInput,
);

const recurringBillUpdateInputSchema = recurringBillInputObjectSchema
	.extend({
		id: z.number(),
	})
	.superRefine(validateRecurringBillInput);

function parseDateInput(value: string | null) {
	if (!value) {
		return null;
	}

	return new Date(`${value}T00:00:00.000Z`);
}

async function replaceAssignments(
	recurringBillId: number,
	assignments: z.infer<typeof recurringBillAssignmentInputSchema>[],
) {
	await db
		.delete(recurringBillAssignments)
		.where(eq(recurringBillAssignments.recurringBillId, recurringBillId));

	const activeAssignments = assignments.filter(
		(assignment) => assignment.isActive,
	);
	if (activeAssignments.length === 0) {
		return;
	}

	await db.insert(recurringBillAssignments).values(
		activeAssignments.map((assignment) => ({
			recurringBillId,
			housemateId: assignment.housemateId,
			customAmount: assignment.customAmount,
			isActive: true,
		})),
	);
}

export const getRecurringBills = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async () => {
		const templates = await db
			.select()
			.from(recurringBills)
			.orderBy(desc(recurringBills.isActive), recurringBills.templateName);

		const templateIds = templates.map((template) => template.id);
		const [assignments, generatedBills] = await Promise.all([
			templateIds.length === 0
				? Promise.resolve<
						Array<{
							id: number;
							recurringBillId: number;
							housemateId: number;
							customAmount: number | null;
							isActive: boolean;
							housemateName: string;
							housemateIsOwner: boolean;
							housemateIsActive: boolean;
						}>
					>([])
				: db
						.select({
							id: recurringBillAssignments.id,
							recurringBillId: recurringBillAssignments.recurringBillId,
							housemateId: recurringBillAssignments.housemateId,
							customAmount: recurringBillAssignments.customAmount,
							isActive: recurringBillAssignments.isActive,
							housemateName: housemates.name,
							housemateIsOwner: housemates.isOwner,
							housemateIsActive: housemates.isActive,
						})
						.from(recurringBillAssignments)
						.innerJoin(
							housemates,
							eq(recurringBillAssignments.housemateId, housemates.id),
						)
						.where(
							inArray(recurringBillAssignments.recurringBillId, templateIds),
						),
			templateIds.length === 0
				? Promise.resolve<
						Array<{ id: number; recurringBillId: number | null }>
					>([])
				: db
						.select({
							id: bills.id,
							recurringBillId: bills.recurringBillId,
						})
						.from(bills)
						.where(inArray(bills.recurringBillId, templateIds)),
		]);

		const generatedCountByTemplateId = new Map<number, number>();
		for (const bill of generatedBills) {
			if (bill.recurringBillId === null) {
				continue;
			}

			generatedCountByTemplateId.set(
				bill.recurringBillId,
				(generatedCountByTemplateId.get(bill.recurringBillId) ?? 0) + 1,
			);
		}

		const assignmentsByTemplateId = new Map<number, typeof assignments>();
		for (const assignment of assignments) {
			const existingAssignments =
				assignmentsByTemplateId.get(assignment.recurringBillId) ?? [];
			existingAssignments.push(assignment);
			assignmentsByTemplateId.set(
				assignment.recurringBillId,
				existingAssignments,
			);
		}

		return await Promise.all(
			templates.map(async (template) => {
				const preview = await previewRecurringBill(template);
				return {
					template,
					assignments: assignmentsByTemplateId.get(template.id) ?? [],
					nextDueDate: getNextDueDate(
						template,
						template.lastGeneratedDate
							? new Date(
									template.lastGeneratedDate.getTime() + 24 * 60 * 60 * 1000,
								)
							: template.startDate,
					),
					preview,
					generatedCount: generatedCountByTemplateId.get(template.id) ?? 0,
				};
			}),
		);
	});

export const createRecurringBill = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(recurringBillInputSchema)
	.handler(async ({ data }) => {
		const [newTemplate] = await db
			.insert(recurringBills)
			.values({
				templateName: data.templateName,
				billerName: data.billerName,
				totalAmount: data.totalAmount,
				frequency: data.frequency,
				dayOfWeek: data.frequency === "weekly" ? data.dayOfWeek : null,
				dayOfMonth: data.frequency === "monthly" ? data.dayOfMonth : null,
				startDate: parseDateInput(data.startDate) ?? new Date(),
				endDate: parseDateInput(data.endDate),
				isActive: data.isActive,
				splitStrategy: data.splitStrategy,
			})
			.returning();

		await replaceAssignments(newTemplate.id, data.assignments);

		return newTemplate;
	});

export const updateRecurringBill = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(recurringBillUpdateInputSchema)
	.handler(async ({ data }) => {
		const [updatedTemplate] = await db
			.update(recurringBills)
			.set({
				templateName: data.templateName,
				billerName: data.billerName,
				totalAmount: data.totalAmount,
				frequency: data.frequency,
				dayOfWeek: data.frequency === "weekly" ? data.dayOfWeek : null,
				dayOfMonth: data.frequency === "monthly" ? data.dayOfMonth : null,
				startDate: parseDateInput(data.startDate) ?? new Date(),
				endDate: parseDateInput(data.endDate),
				isActive: data.isActive,
				splitStrategy: data.splitStrategy,
				updatedAt: new Date(),
			})
			.where(eq(recurringBills.id, data.id))
			.returning();

		if (!updatedTemplate) {
			throw new Error("Recurring bill template not found");
		}

		await replaceAssignments(updatedTemplate.id, data.assignments);
		return updatedTemplate;
	});

export const deleteRecurringBill = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ id: z.number() }))
	.handler(async ({ data }) => {
		await db.delete(recurringBills).where(eq(recurringBills.id, data.id));

		return { success: true };
	});

export const setRecurringBillActive = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			id: z.number(),
			isActive: z.boolean(),
		}),
	)
	.handler(async ({ data }) => {
		const [updatedTemplate] = await db
			.update(recurringBills)
			.set({
				isActive: data.isActive,
				updatedAt: new Date(),
			})
			.where(eq(recurringBills.id, data.id))
			.returning();

		if (!updatedTemplate) {
			throw new Error("Recurring bill template not found");
		}

		return updatedTemplate;
	});

export const generateRecurringBillNow = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ id: z.number() }))
	.handler(async ({ data }) => {
		return await generateRecurringBillById(data.id);
	});
