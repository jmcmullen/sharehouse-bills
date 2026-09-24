import { formatDueDate, formatTiming } from "./bill-timing";

function formatRecurringTemplateLabel(templateName: string) {
	return templateName.replace(/^(weekly|monthly|yearly)\s+/i, "").trim();
}

export function getReceiptBillLabel(input: {
	billerName: string;
	recurringTemplateName?: string | null;
}) {
	if (input.recurringTemplateName?.trim()) {
		return formatRecurringTemplateLabel(input.recurringTemplateName);
	}

	return input.billerName;
}

// "Due Fri 18 Sep · 3 days early" for a paid share.
export function formatReceiptTiming(
	receipt: { dueDate: Date | string; paidAt: Date | string },
	now: Date = new Date(),
) {
	return `Due ${formatDueDate(receipt.dueDate, now)} · ${formatTiming(receipt.dueDate, receipt.paidAt)}`;
}
