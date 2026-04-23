import { generateText, tool } from "ai";
import { and, desc, eq } from "drizzle-orm";
import { createError } from "evlog";
import { z } from "zod";
import { formatReminderBillLabel } from "../../lib/reminder-preview";
import { db } from "../db/index.server";
import { bills } from "../db/schema/bills";
import { debts } from "../db/schema/debts";
import { housemates } from "../db/schema/housemates";
import { paymentTransactions } from "../db/schema/payment-transactions";
import { recurringBills } from "../db/schema/recurring-bills";
import { createAbsoluteDebtReceiptUrl } from "./debt-receipt-page.server";
import {
	createAbsolutePayUrl,
	createPayToken,
	getPublicHousematePayPageData,
} from "./housemate-pay-page.server";
import { getVertexModel } from "./vertex-ai";

const WHATSAPP_ASSISTANT_MODEL = "gemini-2.0-flash-lite-preview-02-05";
const WHATSAPP_ASSISTANT_TIMEOUT_MS = 30_000;
const DUE_SOON_WINDOW_DAYS = 7;
const RECENT_PAYMENT_LIMIT = 3;
const BILL_TYPE_VALUES = [
	"electricity",
	"gas",
	"internet",
	"phone",
	"water",
	"other",
] as const;

type AssistantBillType = (typeof BILL_TYPE_VALUES)[number];

type AssistantHousemate = {
	id: string;
	name: string;
};

type AssistantPayItem = Awaited<
	ReturnType<typeof getPublicHousematePayPageData>
> extends infer PageData
	? PageData extends { items: Array<infer Item> }
		? Item
		: never
	: never;

type AssistantIntent =
	| "tool_answer"
	| "payment_claim_redirect"
	| "unsupported"
	| "fallback_error";

export type WhatsappAssistantResult = {
	intent: AssistantIntent;
	message: string;
	model: string | null;
	toolNames: string[];
	redactedPreview: string;
};

type RecentPayment = {
	transactionId: string;
	amount: number;
	description: string;
	matchType: string;
	paidAt: Date;
	matchedDebtIds: string[];
};

type AssistantToolContext = {
	housemate: AssistantHousemate;
	previewDate?: string | null;
};

function formatDate(date: Date) {
	return new Intl.DateTimeFormat("en-AU", {
		day: "numeric",
		month: "short",
		year: "numeric",
	}).format(date);
}

function formatCompactDate(date: Date) {
	return new Intl.DateTimeFormat("en-AU", {
		day: "numeric",
		month: "short",
	}).format(date);
}

function normalizeText(value: string) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function buildAssistantUnsupportedSummary() {
	return [
		"I can help with what you owe, what's overdue, what's due soon, bill totals, recent payments, receipts, and your pay link.",
		"",
		"Try:",
		"- how much have i got left to pay?",
		"- whats overdue right now?",
		"- whats the total due for electricity?",
		"- what was my last payment?",
		"- send me my pay link",
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
		/\bi (already )?paid\b/.test(normalized) ||
		/\bi ve (already )?paid\b/.test(normalized) ||
		/\bi have (already )?paid\b/.test(normalized) ||
		/\bi sent (it|this|that|the payment|the transfer)?\b/.test(normalized) ||
		/\bi transferred\b/.test(normalized) ||
		/\bpayment (isn t|is not|not) showing\b/.test(normalized) ||
		/\bnot reflected\b/.test(normalized) ||
		/\bstill says\b/.test(normalized) ||
		/\bstill showing\b/.test(normalized) ||
		/\bthat s wrong\b/.test(normalized)
	);
}

export function referencesOtherHousemate(input: {
	body: string;
	housemate: AssistantHousemate;
	activeHousemates: Array<{ id: string; name: string }>;
}) {
	const normalizedBody = normalizeText(input.body);
	const ownFirstName =
		input.housemate.name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";

	return input.activeHousemates.some((activeHousemate) => {
		if (activeHousemate.id === input.housemate.id) {
			return false;
		}

		const firstName = activeHousemate.name
			.trim()
			.split(/\s+/)[0]
			?.toLowerCase();
		if (!firstName || firstName === ownFirstName) {
			return false;
		}

		return new RegExp(
			`\\b${firstName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`,
		).test(normalizedBody);
	});
}

function getBillLabel(
	item: Pick<AssistantPayItem, "billerName" | "recurringTemplateName">,
) {
	return formatReminderBillLabel({
		billerName: item.billerName,
		recurringTemplateName: item.recurringTemplateName,
	});
}

function formatBillPeriod(
	item: Pick<AssistantPayItem, "billPeriodStart" | "billPeriodEnd" | "dueDate">,
) {
	if (item.billPeriodStart && item.billPeriodEnd) {
		return `${formatCompactDate(item.billPeriodStart)} to ${formatCompactDate(item.billPeriodEnd)}`;
	}

	if (item.billPeriodStart) {
		return `From ${formatCompactDate(item.billPeriodStart)}`;
	}

	if (item.billPeriodEnd) {
		return `Until ${formatCompactDate(item.billPeriodEnd)}`;
	}

	return `Due ${formatCompactDate(item.dueDate)}`;
}

function toAssistantBillType(value: string) {
	return BILL_TYPE_VALUES.includes(value as AssistantBillType)
		? (value as AssistantBillType)
		: "other";
}

async function getAssistantPayPageData(input: {
	housemateId: string;
	previewDate?: string | null;
}) {
	const token = createPayToken({
		housemateId: input.housemateId,
	});
	if (!token) {
		throw createError({
			message: "Unable to create pay token for WhatsApp assistant",
			status: 500,
			why: `The assistant could not create a pay token for housemate ${input.housemateId}.`,
			fix: "Check housemate pay token generation before retrying the assistant request.",
		});
	}

	const page = await getPublicHousematePayPageData(token);
	if (!page) {
		throw createError({
			message: "Unable to load pay page data for WhatsApp assistant",
			status: 404,
			why: `The assistant could not load pay page data for housemate ${input.housemateId}.`,
			fix: "Verify the housemate still exists and has a valid pay page token.",
		});
	}

	return {
		...page,
		pageUrl:
			page.links.pageUrl ??
			createAbsolutePayUrl(
				{
					housemateId: input.housemateId,
				},
				input.previewDate,
			),
	};
}

async function getHousemateCreditBalance(housemateId: string) {
	const [housemate] = await db
		.select({
			creditBalance: housemates.creditBalance,
		})
		.from(housemates)
		.where(eq(housemates.id, housemateId))
		.limit(1);

	return housemate?.creditBalance ?? 0;
}

async function getRecentHousematePayments(housemateId: string) {
	const rows = await db
		.select({
			transactionId: paymentTransactions.transactionId,
			amount: paymentTransactions.amount,
			description: paymentTransactions.description,
			matchType: paymentTransactions.matchType,
			settledAt: paymentTransactions.settledAt,
			upCreatedAt: paymentTransactions.upCreatedAt,
			createdAt: paymentTransactions.createdAt,
			matchedDebtIds: paymentTransactions.matchedDebtIds,
		})
		.from(paymentTransactions)
		.where(
			and(
				eq(paymentTransactions.housemateId, housemateId),
				eq(paymentTransactions.status, "matched"),
			),
		)
		.orderBy(
			desc(paymentTransactions.settledAt),
			desc(paymentTransactions.upCreatedAt),
			desc(paymentTransactions.createdAt),
		)
		.limit(RECENT_PAYMENT_LIMIT);

	return rows.map((row) => ({
		transactionId: row.transactionId,
		amount: row.amount,
		description: row.description,
		matchType: row.matchType,
		paidAt: row.settledAt ?? row.upCreatedAt ?? row.createdAt,
		matchedDebtIds: row.matchedDebtIds ?? [],
	})) satisfies RecentPayment[];
}

async function getLatestHousemateReceipt(input: {
	housemateId: string;
	previewDate?: string | null;
}) {
	const [row] = await db
		.select({
			debtId: debts.id,
			paidAt: debts.paidAt,
			billerName: bills.billerName,
			recurringTemplateName: recurringBills.templateName,
			billPeriodStart: bills.billPeriodStart,
			billPeriodEnd: bills.billPeriodEnd,
			amountPaid: debts.amountPaid,
		})
		.from(debts)
		.innerJoin(bills, eq(bills.id, debts.billId))
		.leftJoin(recurringBills, eq(recurringBills.id, bills.recurringBillId))
		.where(
			and(eq(debts.housemateId, input.housemateId), eq(debts.isPaid, true)),
		)
		.orderBy(desc(debts.paidAt), desc(debts.updatedAt))
		.limit(1);

	if (!row?.paidAt) {
		return null;
	}

	return {
		label: getBillLabel(row),
		period:
			row.billPeriodStart || row.billPeriodEnd
				? formatBillPeriod({
						billPeriodStart: row.billPeriodStart,
						billPeriodEnd: row.billPeriodEnd,
						dueDate: row.paidAt,
					})
				: null,
		amountPaid: row.amountPaid,
		paidAt: row.paidAt,
		receiptUrl: createAbsoluteDebtReceiptUrl(
			{
				debtId: row.debtId,
			},
			input.previewDate,
		),
	};
}

function filterItemsByBillType(
	items: AssistantPayItem[],
	billType: AssistantBillType,
) {
	return items.filter(
		(item) => toAssistantBillType(item.billType ?? "other") === billType,
	);
}

function getMostUrgentItem(items: AssistantPayItem[]) {
	return (
		[...items].sort((left, right) => {
			if (left.isOverdue !== right.isOverdue) {
				return left.isOverdue ? -1 : 1;
			}

			const dueDateDifference =
				left.dueDate.getTime() - right.dueDate.getTime();
			if (dueDateDifference !== 0) {
				return dueDateDifference;
			}

			return right.remainingAmount - left.remainingAmount;
		})[0] ?? null
	);
}

function findBillMatch(items: AssistantPayItem[], query: string) {
	const normalizedQuery = normalizeText(query);
	if (!normalizedQuery) {
		return null;
	}

	const matchScore = (item: AssistantPayItem) => {
		const candidateText = normalizeText(
			[
				item.billerName,
				item.recurringTemplateName,
				getBillLabel(item),
				formatBillPeriod(item),
			]
				.filter(Boolean)
				.join(" "),
		);

		if (candidateText === normalizedQuery) {
			return 4;
		}

		if (candidateText.startsWith(normalizedQuery)) {
			return 3;
		}

		if (candidateText.includes(normalizedQuery)) {
			return 2;
		}

		const queryTokens = normalizedQuery.split(" ");
		return queryTokens.every((token) => candidateText.includes(token)) ? 1 : 0;
	};

	return (
		[...items]
			.map((item) => ({
				item,
				score: matchScore(item),
			}))
			.filter((result) => result.score > 0)
			.sort((left, right) => {
				if (left.score !== right.score) {
					return right.score - left.score;
				}

				return left.item.dueDate.getTime() - right.item.dueDate.getTime();
			})[0]?.item ?? null
	);
}

function createAssistantTools(context: AssistantToolContext) {
	const payPagePromise = getAssistantPayPageData({
		housemateId: context.housemate.id,
		previewDate: context.previewDate,
	});
	const creditBalancePromise = getHousemateCreditBalance(context.housemate.id);
	const recentPaymentsPromise = getRecentHousematePayments(
		context.housemate.id,
	);
	const latestReceiptPromise = getLatestHousemateReceipt({
		housemateId: context.housemate.id,
		previewDate: context.previewDate,
	});

	return {
		get_housemate_outstanding_summary: tool({
			description:
				"Get the sender's current unpaid total, unpaid bill count, overdue count, grouped utilities, and pay link.",
			parameters: z.object({}),
			execute: async () => {
				const page = await payPagePromise;
				return {
					housemateName: page.housemate.name,
					totalOutstanding: page.paymentProgress.remainingAmount,
					unpaidBillCount: page.summary.billCount,
					overdueBillCount: page.summary.overdueCount,
					utilityGroups: page.utilityGroups.map((group) => ({
						label: group.label,
						total: group.items.reduce(
							(sum, item) => sum + item.remainingAmount,
							0,
						),
						billCount: group.items.length,
					})),
					payUrl: page.pageUrl,
				};
			},
		}),
		get_overdue_summary: tool({
			description:
				"Get only the sender's overdue unpaid bills and overdue total.",
			parameters: z.object({}),
			execute: async () => {
				const page = await payPagePromise;
				const overdueItems = page.items.filter((item) => item.isOverdue);
				return {
					housemateName: page.housemate.name,
					overdueTotal: overdueItems.reduce(
						(sum, item) => sum + item.remainingAmount,
						0,
					),
					overdueCount: overdueItems.length,
					bills: overdueItems.slice(0, 6).map((item) => ({
						label: getBillLabel(item),
						period: formatBillPeriod(item),
						amountDue: item.remainingAmount,
						dueDate: formatDate(item.dueDate),
						billUrl: item.billUrl,
					})),
					payUrl: page.pageUrl,
				};
			},
		}),
		get_due_soon_summary: tool({
			description:
				"Get the sender's unpaid bills due in the next 7 days, excluding already overdue bills.",
			parameters: z.object({}),
			execute: async () => {
				const page = await payPagePromise;
				const today = new Date();
				const dueSoonCutoff = new Date(
					today.getTime() + DUE_SOON_WINDOW_DAYS * 24 * 60 * 60 * 1000,
				);
				const dueSoonItems = page.items.filter(
					(item) => !item.isOverdue && item.dueDate <= dueSoonCutoff,
				);
				return {
					housemateName: page.housemate.name,
					windowDays: DUE_SOON_WINDOW_DAYS,
					dueSoonTotal: dueSoonItems.reduce(
						(sum, item) => sum + item.remainingAmount,
						0,
					),
					dueSoonCount: dueSoonItems.length,
					bills: dueSoonItems.slice(0, 6).map((item) => ({
						label: getBillLabel(item),
						period: formatBillPeriod(item),
						amountDue: item.remainingAmount,
						dueDate: formatDate(item.dueDate),
						billUrl: item.billUrl,
					})),
					payUrl: page.pageUrl,
				};
			},
		}),
		get_unpaid_bill_count: tool({
			description: "Get the sender's current unpaid bill count.",
			parameters: z.object({}),
			execute: async () => {
				const page = await payPagePromise;
				return {
					housemateName: page.housemate.name,
					unpaidBillCount: page.summary.billCount,
					overdueBillCount: page.summary.overdueCount,
				};
			},
		}),
		get_bill_type_total_due: tool({
			description:
				"Get the sender's unpaid total for a bill type such as electricity or gas.",
			parameters: z.object({
				billType: z.enum(BILL_TYPE_VALUES),
			}),
			execute: async ({ billType }) => {
				const page = await payPagePromise;
				const matchingItems = filterItemsByBillType(page.items, billType);
				return {
					housemateName: page.housemate.name,
					billType,
					totalDue: matchingItems.reduce(
						(sum, item) => sum + item.remainingAmount,
						0,
					),
					billCount: matchingItems.length,
				};
			},
		}),
		get_bill_type_breakdown: tool({
			description:
				"Get a short period-and-amount breakdown for one bill type such as electricity or gas.",
			parameters: z.object({
				billType: z.enum(BILL_TYPE_VALUES),
			}),
			execute: async ({ billType }) => {
				const page = await payPagePromise;
				const matchingItems = filterItemsByBillType(page.items, billType);
				return {
					housemateName: page.housemate.name,
					billType,
					totalDue: matchingItems.reduce(
						(sum, item) => sum + item.remainingAmount,
						0,
					),
					bills: matchingItems.slice(0, 8).map((item) => ({
						period: formatBillPeriod(item),
						amountDue: item.remainingAmount,
						billUrl: item.billUrl,
					})),
				};
			},
		}),
		get_most_urgent_bill: tool({
			description: "Get the sender's single most urgent unpaid bill.",
			parameters: z.object({}),
			execute: async () => {
				const page = await payPagePromise;
				const item = getMostUrgentItem(page.items);
				if (!item) {
					return {
						housemateName: page.housemate.name,
						hasUnpaidBills: false,
					};
				}

				return {
					housemateName: page.housemate.name,
					hasUnpaidBills: true,
					label: getBillLabel(item),
					period: formatBillPeriod(item),
					amountDue: item.remainingAmount,
					dueDate: formatDate(item.dueDate),
					isOverdue: item.isOverdue,
					billUrl: item.billUrl,
				};
			},
		}),
		get_bill_link_by_name: tool({
			description:
				"Find one of the sender's unpaid bills by a biller or template name and return its individual bill link.",
			parameters: z.object({
				query: z.string().min(1),
			}),
			execute: async ({ query }) => {
				const page = await payPagePromise;
				const match = findBillMatch(page.items, query);
				if (!match) {
					return {
						housemateName: page.housemate.name,
						found: false,
						query,
					};
				}

				return {
					housemateName: page.housemate.name,
					found: true,
					label: getBillLabel(match),
					period: formatBillPeriod(match),
					amountDue: match.remainingAmount,
					billUrl: match.billUrl,
				};
			},
		}),
		get_housemate_pay_link: tool({
			description: "Get the sender's pay-all link for current unpaid bills.",
			parameters: z.object({}),
			execute: async () => {
				const page = await payPagePromise;
				return {
					housemateName: page.housemate.name,
					totalOutstanding: page.paymentProgress.remainingAmount,
					payUrl: page.pageUrl,
				};
			},
		}),
		get_housemate_credit_balance: tool({
			description: "Get the sender's current credit balance.",
			parameters: z.object({}),
			execute: async () => {
				const creditBalance = await creditBalancePromise;
				return {
					housemateName: context.housemate.name,
					creditBalance,
					hasCredit: creditBalance > 0.009,
				};
			},
		}),
		get_recent_payment_summary: tool({
			description:
				"Get the sender's recent matched payments, up to the last 3 payments.",
			parameters: z.object({}),
			execute: async () => {
				const recentPayments = await recentPaymentsPromise;
				return {
					housemateName: context.housemate.name,
					payments: recentPayments.map((payment) => ({
						amount: payment.amount,
						description: payment.description,
						paidAt: formatDate(payment.paidAt),
						matchType: payment.matchType,
						receiptCount: payment.matchedDebtIds.length,
					})),
				};
			},
		}),
		get_latest_receipt_link: tool({
			description: "Get the sender's latest available payment receipt link.",
			parameters: z.object({}),
			execute: async () => {
				const latestReceipt = await latestReceiptPromise;
				if (!latestReceipt) {
					return {
						housemateName: context.housemate.name,
						found: false,
					};
				}

				return {
					housemateName: context.housemate.name,
					found: true,
					label: latestReceipt.label,
					period: latestReceipt.period,
					amountPaid: latestReceipt.amountPaid,
					paidAt: formatDate(latestReceipt.paidAt),
					receiptUrl: latestReceipt.receiptUrl,
				};
			},
		}),
		list_allowed_capabilities: tool({
			description: "List what the WhatsApp billing assistant can help with.",
			parameters: z.object({}),
			execute: async () => ({
				housemateName: context.housemate.name,
				capabilities: [
					"Current outstanding total",
					"Overdue and due-soon bills",
					"Electricity and gas totals",
					"Most urgent bill",
					"Bill links and pay link",
					"Credit balance",
					"Recent payments",
					"Latest receipt link",
				],
				examples: [
					"how much have i got left to pay?",
					"whats overdue right now?",
					"whats the total due for electricity?",
					"what was my last payment?",
					"send me my pay link",
				],
			}),
		}),
	};
}

export async function buildWhatsappAssistantReply(input: {
	body: string;
	housemate: AssistantHousemate;
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
				"You are a WhatsApp billing assistant for one housemate only.",
				"You can help only with the sender's own bills, pay link, credit, recent payments, and receipt links.",
				"You must use the provided tools before answering questions about balances, bills, payments, or links.",
				"If the request is unsupported, asks to change data, disputes a payment, or asks about someone else's bills, reply exactly with UNSUPPORTED_REQUEST.",
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
				message: buildAssistantUnsupportedSummary(),
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
			message: buildAssistantUnsupportedSummary(),
			model: WHATSAPP_ASSISTANT_MODEL,
			toolNames: [],
			redactedPreview,
		} satisfies WhatsappAssistantResult;
	}
}

export {
	buildAssistantOtherHousemateSummary,
	buildAssistantUnsupportedSummary,
	buildPaymentClaimRedirectSummary,
};
