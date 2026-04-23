import { formatCurrency } from "./share-preview";

function formatReminderDate(date: Date | string) {
	return new Intl.DateTimeFormat("en-AU", {
		weekday: "short",
		day: "numeric",
		month: "short",
	}).format(new Date(date));
}

export function formatReminderBillLabel(input: {
	billerName: string;
	recurringTemplateName?: string | null;
}) {
	const billerName = input.billerName.trim();
	const recurringTemplateName = input.recurringTemplateName?.trim() ?? "";
	if (!recurringTemplateName) {
		return billerName;
	}

	return billerName.toLowerCase().includes(recurringTemplateName.toLowerCase())
		? billerName
		: `${billerName} ${recurringTemplateName}`;
}

export function formatReminderDueLine(input: {
	dueDate: Date | string;
	isOverdue: boolean;
}) {
	return `${input.isOverdue ? "Was due" : "Due"} ${formatReminderDate(input.dueDate)}`;
}

export function formatReminderMetaDescription(input: {
	billerName: string;
	recurringTemplateName?: string | null;
	dueDate: Date | string;
	remainingAmount: number;
	isOverdue: boolean;
}) {
	const label = formatReminderBillLabel(input);
	return `${label} ${input.isOverdue ? "was" : "is"} due ${formatReminderDate(input.dueDate)} for ${formatCurrency(input.remainingAmount)}`;
}
