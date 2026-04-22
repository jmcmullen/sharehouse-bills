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
