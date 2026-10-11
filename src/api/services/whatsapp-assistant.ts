import { generateText, tool } from "ai";
import { normalizeText } from "./assistant/data";
import { createHouseTools } from "./assistant/house-tools";
import {
	type AssistantToolContext,
	createOwnTools,
} from "./assistant/own-tools";
import { EMPTY_TOOL_PARAMETERS } from "./assistant/parameters";
import { getVertexModel } from "./vertex-ai";

const WHATSAPP_ASSISTANT_MODEL = "gemini-2.5-flash";
const WHATSAPP_ASSISTANT_TIMEOUT_MS = 30_000;

type AssistantHousemate = {
	id: string;
	name: string;
	isOwner?: boolean;
};

type AssistantIntent =
	| "tool_answer"
	| "payment_claim_redirect"
	| "unsupported"
	| "fallback_error";

type WhatsappAssistantResult = {
	intent: AssistantIntent;
	message: string;
	model: string | null;
	toolNames: string[];
	redactedPreview: string;
};

function formatToday() {
	return new Intl.DateTimeFormat("en-AU", {
		day: "numeric",
		month: "short",
		year: "numeric",
	}).format(new Date());
}

function buildAssistantUnsupportedSummary(options?: {
	isPrivileged?: boolean;
}) {
	return [
		options?.isPrivileged
			? "I can help with balances, bill breakdowns, overdue and due-soon bills, bill totals, payment history, receipts, pay links, and house-wide admin summaries."
			: "I can help with what you owe, what makes up your total, what's overdue, what is due soon, bill totals, payment history, receipts, and your pay link.",
		"",
		"Try:",
		"- how much have i got left to pay?",
		"- what makes up my total?",
		"- whats overdue right now?",
		"- what do i need to pay this week?",
		"- have i paid the cleaners bill?",
		"- whats the total due for electricity?",
		"- how much have i paid in the last 30 days?",
		"- send me my pay link",
		...(options?.isPrivileged
			? [
					"- how much does everyone owe in total?",
					"- who is overdue right now?",
					"- what payments came in this week?",
					"- are there any unreconciled transactions?",
					"- whats the collection status of the cleaners bill?",
				]
			: []),
		"",
		"If you've already paid or something looks wrong, message Jay.",
	].join("\n");
}

function buildAssistantOtherHousemateSummary() {
	return [
		"I can only help with your own bills and payments.",
		"If you need something for someone else, message Jay.",
	].join("\n");
}

function buildPaymentClaimRedirectSummary() {
	return [
		"If you've already paid or something looks wrong, message Jay and he'll sort it out.",
	].join("\n");
}

function previewMessageBody(body: string) {
	const normalized = body.replace(/\s+/g, " ").trim();
	return normalized.length <= 120
		? normalized
		: `${normalized.slice(0, 117).trimEnd()}...`;
}

function isPaymentClaimMessage(body: string) {
	const normalized = normalizeText(body);

	return (
		/^(i (already )?paid|i ve (already )?paid|i have (already )?paid)\b/.test(
			normalized,
		) ||
		/\bi paid (this|that|it|the bill|the rent|the transfer)\b/.test(
			normalized,
		) ||
		/\bi sent (it|this|that|the payment|the transfer)?\b/.test(normalized) ||
		/\bi transferred\b/.test(normalized) ||
		/\bpayment (isn t|is not|not) showing\b/.test(normalized) ||
		/\bnot reflected\b/.test(normalized) ||
		/\bstill says\b/.test(normalized) ||
		/\bstill showing\b/.test(normalized) ||
		/\bthat s wrong\b/.test(normalized)
	);
}

function findReferencedHousemate(input: {
	body: string;
	housemate: AssistantHousemate;
	activeHousemates: Array<{ id: string; name: string; isOwner?: boolean }>;
}) {
	const normalizedBody = normalizeText(input.body);
	const ownFirstName =
		input.housemate.name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";

	return (
		input.activeHousemates.find((activeHousemate) => {
			if (activeHousemate.id === input.housemate.id) {
				return false;
			}

			const firstName = activeHousemate.name
				.trim()
				.split(/\s+/)[0]
				?.toLowerCase();
			if (!firstName || firstName === ownFirstName || activeHousemate.isOwner) {
				return false;
			}

			return new RegExp(
				`\\b${firstName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`,
			).test(normalizedBody);
		}) ?? null
	);
}

function referencesWholeHouse(body: string) {
	const normalized = normalizeText(body);
	const asksAboutAmount =
		/\b(owe|owes|owed|due|outstanding|left to pay|in total|total)\b/.test(
			normalized,
		);

	return (
		asksAboutAmount &&
		(/\b(everyone|everybody)\b/.test(normalized) ||
			/\ball housemates\b/.test(normalized) ||
			/\ball of us\b/.test(normalized) ||
			/\bthe house\b/.test(normalized))
	);
}

function createAssistantTools(context: AssistantToolContext) {
	const tools = {
		...createOwnTools(context),
		list_allowed_capabilities: tool({
			description: "List what the WhatsApp billing assistant can help with.",
			parameters: EMPTY_TOOL_PARAMETERS,
			execute: async () => ({
				housemateName: context.housemate.name,
				capabilities: [
					"Current outstanding total",
					"Bill breakdowns and bill status",
					"Overdue and due-soon bills",
					"Bills due within a chosen window",
					"Electricity and gas totals",
					"Most urgent and oldest unpaid bill",
					"Bill links and pay link",
					"Credit balance",
					"Recent payments and totals",
					"Latest receipt link and receipts by bill",
					...(context.housemate.isOwner
						? [
								"House-wide overdue and due-soon totals",
								"House-wide payment summaries",
								"Unreconciled bank transactions",
								"Bill collection status across housemates",
							]
						: []),
				],
				examples: [
					"how much have i got left to pay?",
					"what makes up my total?",
					"whats overdue right now?",
					"what do i need to pay this week?",
					"whats the total due for electricity?",
					"have i paid the cleaners bill?",
					"what was my last payment?",
					"send me my pay link",
					...(context.housemate.isOwner
						? [
								"who is overdue right now?",
								"what payments came in this week?",
								"are there any unreconciled transactions?",
							]
						: []),
				],
			}),
		}),
	};
	return context.housemate.isOwner
		? { ...tools, ...createHouseTools(context) }
		: tools;
}

export async function buildWhatsappAssistantReply(input: {
	body: string;
	housemate: AssistantHousemate;
	requesterHousemate?: AssistantHousemate;
	isPrivileged?: boolean;
	previewDate?: string | null;
}) {
	const redactedPreview = previewMessageBody(input.body);

	if (isPaymentClaimMessage(input.body)) {
		return {
			intent: "payment_claim_redirect",
			message: buildPaymentClaimRedirectSummary(),
			model: null,
			toolNames: [],
			redactedPreview,
		} satisfies WhatsappAssistantResult;
	}

	try {
		const result = await generateText({
			model: getVertexModel(WHATSAPP_ASSISTANT_MODEL),
			system: [
				input.isPrivileged
					? "You are a WhatsApp billing assistant for the house admin. You can help with the requester's own bills, other named housemates, and house-wide totals when relevant."
					: "You are a WhatsApp billing assistant for one housemate only.",
				input.isPrivileged
					? `The current target account is ${input.housemate.name}. If the user asked about a named housemate, that target has already been resolved for you.`
					: "You can help only with the sender's own bills, pay link, credit, recent payments, and receipt links.",
				input.isPrivileged
					? "For questions about everyone, the whole house, or all housemates, use the house-wide tools instead of the target-housemate tools."
					: "Do not answer about other housemates.",
				`Today's date is ${formatToday()}. Convert relative date requests like this week or before Friday into the right day-window tool inputs.`,
				"You must use the provided tools before answering questions about balances, bills, payments, or links.",
				input.isPrivileged
					? "If the request is unsupported or asks to change data or disputes a payment, reply exactly with UNSUPPORTED_REQUEST."
					: "If the request is unsupported, asks to change data, disputes a payment, or asks about someone else's bills, reply exactly with UNSUPPORTED_REQUEST.",
				"When mentioning money, use Australian dollars.",
				"Keep replies short and useful for WhatsApp.",
				"Never invent amounts, dates, bill names, or links.",
			].join(" "),
			prompt: input.body,
			tools: createAssistantTools({
				housemate: input.housemate,
				previewDate: input.previewDate,
			}),
			maxSteps: 3,
			maxRetries: 1,
			temperature: 0,
			abortSignal: AbortSignal.timeout(WHATSAPP_ASSISTANT_TIMEOUT_MS),
		});

		const toolNames = [
			...new Set(
				result.steps.flatMap((step) =>
					step.toolCalls.map((toolCall) => toolCall.toolName),
				),
			),
		];
		const text = result.text.trim();

		if (!text || text === "UNSUPPORTED_REQUEST") {
			return {
				intent: "unsupported",
				message: buildAssistantUnsupportedSummary({
					isPrivileged: input.isPrivileged,
				}),
				model: WHATSAPP_ASSISTANT_MODEL,
				toolNames,
				redactedPreview,
			} satisfies WhatsappAssistantResult;
		}

		return {
			intent: "tool_answer",
			message: text,
			model: WHATSAPP_ASSISTANT_MODEL,
			toolNames,
			redactedPreview,
		} satisfies WhatsappAssistantResult;
	} catch {
		return {
			intent: "fallback_error",
			message: buildAssistantUnsupportedSummary({
				isPrivileged: input.isPrivileged,
			}),
			model: WHATSAPP_ASSISTANT_MODEL,
			toolNames: [],
			redactedPreview,
		} satisfies WhatsappAssistantResult;
	}
}

export {
	buildAssistantOtherHousemateSummary,
	findReferencedHousemate,
	referencesWholeHouse,
};
