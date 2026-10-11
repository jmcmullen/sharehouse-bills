import { jsonSchema } from "ai";
import { type AssistantBillType, billTypeValues } from "./data";

export const EMPTY_TOOL_PARAMETERS = jsonSchema({
	type: "object",
	properties: {},
	additionalProperties: false,
});

export const BILL_TYPE_TOOL_PARAMETERS = jsonSchema<{
	billType: AssistantBillType;
}>({
	type: "object",
	properties: {
		billType: {
			type: "string",
			enum: billTypeValues(),
			description:
				"The bill type to look up. Use electricity, gas, internet, phone, water, or other.",
		},
	},
	required: ["billType"],
	additionalProperties: false,
});

export const BILL_QUERY_TOOL_PARAMETERS = jsonSchema<{ query: string }>({
	type: "object",
	properties: {
		query: {
			type: "string",
			description:
				"The bill name or biller to search for, such as cleaners, telstra, or electricity.",
		},
	},
	required: ["query"],
	additionalProperties: false,
});

export const DAY_WINDOW_TOOL_PARAMETERS = jsonSchema<{ days: number }>({
	type: "object",
	properties: {
		days: {
			type: "number",
			minimum: 1,
			maximum: 90,
			description:
				"The number of days from today to include. Use 7 for this week, 14 for the next two weeks, or 30 for this month.",
		},
	},
	required: ["days"],
	additionalProperties: false,
});
