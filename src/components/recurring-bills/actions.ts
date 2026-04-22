import {
	createRecurringBill,
	deleteRecurringBill,
	generateRecurringBillNow,
	setRecurringBillActive,
	updateRecurringBill,
} from "@/functions/recurring-bills";
import type { RecurringBillFormData } from "./types";
import { getRecurringReminderConfigPayload } from "./utils";

function toServerPayload(formData: RecurringBillFormData) {
	return {
		templateName: formData.templateName.trim(),
		billerName: formData.billerName.trim(),
		totalAmount: Number.parseFloat(formData.totalAmount),
		frequency: formData.frequency,
		dayOfWeek:
			formData.frequency === "weekly" && formData.dayOfWeek !== ""
				? Number.parseInt(formData.dayOfWeek, 10)
				: null,
		dayOfMonth:
			formData.frequency === "monthly" && formData.dayOfMonth !== ""
				? Number.parseInt(formData.dayOfMonth, 10)
				: null,
		startDate: formData.startDate,
		endDate: formData.endDate || null,
		isActive: formData.isActive,
		splitStrategy: formData.splitStrategy,
		reminderConfig: getRecurringReminderConfigPayload(formData),
		assignments: formData.assignments.map((assignment) => ({
			housemateId: assignment.housemateId,
			isActive: assignment.isActive,
			customAmount:
				assignment.customAmount === ""
					? null
					: Number.parseFloat(assignment.customAmount),
		})),
	};
}

export async function createRecurringBillAction(
	formData: RecurringBillFormData,
) {
	await createRecurringBill({
		data: toServerPayload(formData),
	});
}

export async function updateRecurringBillAction(
	formData: RecurringBillFormData,
) {
	if (formData.id === null) {
		throw new Error("Recurring bill id is required");
	}

	await updateRecurringBill({
		data: {
			id: formData.id,
			...toServerPayload(formData),
		},
	});
}

export async function deleteRecurringBillAction(id: string) {
	await deleteRecurringBill({ data: { id } });
}

export async function setRecurringBillActiveAction(
	id: string,
	isActive: boolean,
) {
	await setRecurringBillActive({
		data: { id, isActive },
	});
}

export async function generateRecurringBillNowAction(id: string) {
	return await generateRecurringBillNow({ data: { id } });
}
