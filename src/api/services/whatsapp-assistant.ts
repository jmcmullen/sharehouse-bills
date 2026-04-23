import { generateText, jsonSchema, tool } from "ai";
import { and, desc, eq } from "drizzle-orm";
import { createError } from "evlog";
import { formatReminderBillLabel } from "../../lib/reminder-preview";
import { db } from "../db/index.server";
import { bills } from "../db/schema/bills";
import { debts } from "../db/schema/debts";
import { housemates } from "../db/schema/housemates";
import { paymentTransactions } from "../db/schema/payment-transactions";
import { recurringBills } from "../db/schema/recurring-bills";
import { unreconciledTransactions } from "../db/schema/unreconciled-transactions";
import { BillPdfStorageService } from "./bill-pdf-storage";
import { createAbsoluteDebtReceiptUrl } from "./debt-receipt-page.server";
import {
	createAbsolutePayUrl,
	createPayToken,
	getPublicHousematePayPageData,
} from "./housemate-pay-page.server";
import { getVertexModel } from "./vertex-ai";

const WHATSAPP_ASSISTANT_MODEL = "gemini-2.5-flash";
const WHATSAPP_ASSISTANT_TIMEOUT_MS = 30_000;
const DUE_SOON_WINDOW_DAYS = 7;
const RECENT_PAYMENT_LIMIT = 3;
const HOUSEWIDE_RECENT_PAYMENT_LIMIT = 5;
const BILL_BREAKDOWN_LIMIT = 8;
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
	isOwner?: boolean;
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

type HousemateBillRecord = {
	debtId: string;
	billId: string;
	label: string;
	billType: AssistantBillType;
	period: string;
	dueDate: Date;
	amountOwed: number;
	amountPaid: number;
	remainingAmount: number;
	isPaid: boolean;
	paidAt: Date | null;
	billUrl: string | null;
	receiptUrl: string | null;
};

type HousewideUnpaidItem = {
	housemateId: string;
	housemateName: string;
	billId: string;
	label: string;
	billType: AssistantBillType;
	period: string;
	dueDate: Date;
	remainingAmount: number;
	isOverdue: boolean;
	billUrl: string | null;
};

type HousewideRecentPayment = {
	transactionId: string;
	housemateId: string;
	housemateName: string;
	amount: number;
	description: string;
	matchType: string;
	paidAt: Date;
};

type AssistantToolContext = {
	housemate: AssistantHousemate;
	previewDate?: string | null;
};

const EMPTY_TOOL_PARAMETERS = jsonSchema({
	type: "object",
	properties: {},
	additionalProperties: false,
});
const BILL_TYPE_TOOL_PARAMETERS = jsonSchema<{ billType: AssistantBillType }>({
	type: "object",
	properties: {
		billType: {
			type: "string",
			enum: [...BILL_TYPE_VALUES],
			description:
				"The bill type to look up. Use electricity, gas, internet, phone, water, or other.",
		},
	},
	required: ["billType"],
	additionalProperties: false,
});
const BILL_QUERY_TOOL_PARAMETERS = jsonSchema<{ query: string }>({
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
const DAY_WINDOW_TOOL_PARAMETERS = jsonSchema<{ days: number }>({
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

export function referencesOtherHousemate(input: {
	body: string;
	housemate: AssistantHousemate;
	activeHousemates: Array<{ id: string; name: string; isOwner?: boolean }>;
}) {
	return findReferencedHousemate(input) !== null;
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

function clampWindowDays(days: number) {
	return Math.max(1, Math.min(90, Math.round(days)));
}

function getWindowCutoff(days: number) {
	return new Date(Date.now() + clampWindowDays(days) * 24 * 60 * 60 * 1000);
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
		const [housemate] = await db
			.select({
				id: housemates.id,
				name: housemates.name,
			})
			.from(housemates)
			.where(eq(housemates.id, input.housemateId))
			.limit(1);

		if (!housemate) {
			throw createError({
				message: "Unable to load pay page data for WhatsApp assistant",
				status: 404,
				why: `The assistant could not load pay page data for housemate ${input.housemateId}.`,
				fix: "Verify the housemate still exists and has a valid pay page token.",
			});
		}

		return {
			housemate,
			scope: {
				kind: "all" as const,
				stackGroup: null,
				billIds: null,
				allBillsPath: null,
			},
			summary: {
				billCount: 0,
				overdueCount: 0,
				utilityBillCount: 0,
				otherBillCount: 0,
			},
			paymentProgress: {
				settledAmount: 0,
				remainingAmount: 0,
				percentage: 100,
			},
			recentlySettled: {
				amount: 0,
				billCount: 0,
				sinceIso: new Date().toISOString(),
				latestPaidIso: null,
			},
			items: [],
			utilityGroups: [],
			nonUtilityItems: [],
			links: {
				pagePath: "",
				pageUrl: null,
				ogImagePath: "",
				ogImageUrl: null,
			},
			pageUrl: null,
		};
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

async function getRecentHousematePayments(input: {
	housemateId: string;
	limit?: number;
}) {
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
				eq(paymentTransactions.housemateId, input.housemateId),
				eq(paymentTransactions.status, "matched"),
			),
		)
		.orderBy(
			desc(paymentTransactions.settledAt),
			desc(paymentTransactions.upCreatedAt),
			desc(paymentTransactions.createdAt),
		)
		.limit(input.limit ?? RECENT_PAYMENT_LIMIT);

	return rows.map((row) => ({
		transactionId: row.transactionId,
		amount: row.amount,
		description: row.description,
		matchType: row.matchType,
		paidAt: row.settledAt ?? row.upCreatedAt ?? row.createdAt,
		matchedDebtIds: row.matchedDebtIds ?? [],
	})) satisfies RecentPayment[];
}

async function getHousemateBillRecords(input: {
	housemateId: string;
	previewDate?: string | null;
}) {
	const rows = await db
		.select({
			debtId: debts.id,
			billId: bills.id,
			billerName: bills.billerName,
			billType: bills.billType,
			dueDate: bills.dueDate,
			billPeriodStart: bills.billPeriodStart,
			billPeriodEnd: bills.billPeriodEnd,
			recurringTemplateName: recurringBills.templateName,
			amountOwed: debts.amountOwed,
			amountPaid: debts.amountPaid,
			isPaid: debts.isPaid,
			paidAt: debts.paidAt,
		})
		.from(debts)
		.innerJoin(bills, eq(bills.id, debts.billId))
		.leftJoin(recurringBills, eq(recurringBills.id, bills.recurringBillId))
		.where(eq(debts.housemateId, input.housemateId))
		.orderBy(desc(bills.dueDate), desc(bills.createdAt), desc(debts.createdAt));

	return rows.map((row) => ({
		debtId: row.debtId,
		billId: row.billId,
		label: getBillLabel(row),
		billType: toAssistantBillType(row.billType ?? "other"),
		period: formatBillPeriod({
			billPeriodStart: row.billPeriodStart,
			billPeriodEnd: row.billPeriodEnd,
			dueDate: row.dueDate,
		}),
		dueDate: row.dueDate,
		amountOwed: row.amountOwed,
		amountPaid: row.amountPaid ?? 0,
		remainingAmount: Math.max(0, row.amountOwed - (row.amountPaid ?? 0)),
		isPaid: row.isPaid,
		paidAt: row.paidAt,
		billUrl: BillPdfStorageService.getAbsoluteViewerUrl(
			row.billId,
			input.previewDate,
		),
		receiptUrl:
			row.isPaid && row.paidAt
				? createAbsoluteDebtReceiptUrl(
						{
							debtId: row.debtId,
						},
						input.previewDate,
					)
				: null,
	})) satisfies HousemateBillRecord[];
}

function findBillRecordMatch(records: HousemateBillRecord[], query: string) {
	const normalizedQuery = normalizeText(query);
	if (!normalizedQuery) {
		return null;
	}

	const matchScore = (record: HousemateBillRecord) => {
		const candidateText = normalizeText(
			[record.label, record.period, record.billType, record.billId]
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
		[...records]
			.map((record) => ({
				record,
				score: matchScore(record),
			}))
			.filter((result) => result.score > 0)
			.sort((left, right) => {
				if (left.score !== right.score) {
					return right.score - left.score;
				}

				if (left.record.isPaid !== right.record.isPaid) {
					return left.record.isPaid ? 1 : -1;
				}

				return left.record.dueDate.getTime() - right.record.dueDate.getTime();
			})[0]?.record ?? null
	);
}

async function getHousewideUnpaidItems(previewDate?: string | null) {
	const today = new Date();
	const rows = await db
		.select({
			housemateId: housemates.id,
			housemateName: housemates.name,
			billId: bills.id,
			billerName: bills.billerName,
			billType: bills.billType,
			dueDate: bills.dueDate,
			billPeriodStart: bills.billPeriodStart,
			billPeriodEnd: bills.billPeriodEnd,
			recurringTemplateName: recurringBills.templateName,
			amountOwed: debts.amountOwed,
			amountPaid: debts.amountPaid,
		})
		.from(housemates)
		.innerJoin(debts, eq(debts.housemateId, housemates.id))
		.innerJoin(bills, eq(bills.id, debts.billId))
		.leftJoin(recurringBills, eq(recurringBills.id, bills.recurringBillId))
		.where(
			and(
				eq(housemates.isActive, true),
				eq(housemates.isOwner, false),
				eq(debts.isPaid, false),
			),
		)
		.orderBy(desc(bills.dueDate), desc(bills.createdAt));

	return rows
		.map((row) => ({
			housemateId: row.housemateId,
			housemateName: row.housemateName,
			billId: row.billId,
			label: getBillLabel(row),
			billType: toAssistantBillType(row.billType ?? "other"),
			period: formatBillPeriod({
				billPeriodStart: row.billPeriodStart,
				billPeriodEnd: row.billPeriodEnd,
				dueDate: row.dueDate,
			}),
			dueDate: row.dueDate,
			remainingAmount: Math.max(0, row.amountOwed - (row.amountPaid ?? 0)),
			isOverdue: row.dueDate.getTime() < today.getTime(),
			billUrl: BillPdfStorageService.getAbsoluteViewerUrl(
				row.billId,
				previewDate,
			),
		}))
		.filter(
			(item) => item.remainingAmount > 0.009,
		) satisfies HousewideUnpaidItem[];
}

async function getHousewideRecentPayments(input?: { days?: number }) {
	const days = clampWindowDays(input?.days ?? DUE_SOON_WINDOW_DAYS);
	const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
	const rows = await db
		.select({
			transactionId: paymentTransactions.transactionId,
			housemateId: housemates.id,
			housemateName: housemates.name,
			amount: paymentTransactions.amount,
			description: paymentTransactions.description,
			matchType: paymentTransactions.matchType,
			settledAt: paymentTransactions.settledAt,
			upCreatedAt: paymentTransactions.upCreatedAt,
			createdAt: paymentTransactions.createdAt,
		})
		.from(paymentTransactions)
		.innerJoin(housemates, eq(housemates.id, paymentTransactions.housemateId))
		.where(
			and(
				eq(paymentTransactions.status, "matched"),
				eq(housemates.isOwner, false),
				eq(housemates.isActive, true),
			),
		)
		.orderBy(
			desc(paymentTransactions.settledAt),
			desc(paymentTransactions.upCreatedAt),
			desc(paymentTransactions.createdAt),
		)
		.limit(25);

	return rows
		.map((row) => ({
			transactionId: row.transactionId,
			housemateId: row.housemateId,
			housemateName: row.housemateName,
			amount: row.amount,
			description: row.description,
			matchType: row.matchType,
			paidAt: row.settledAt ?? row.upCreatedAt ?? row.createdAt,
		}))
		.filter((row) => row.paidAt >= since) satisfies HousewideRecentPayment[];
}

async function getUnreconciledTransactionRows() {
	return db
		.select({
			transactionId: unreconciledTransactions.transactionId,
			description: unreconciledTransactions.description,
			amount: unreconciledTransactions.amount,
			reason: unreconciledTransactions.reason,
			createdAt: unreconciledTransactions.createdAt,
		})
		.from(unreconciledTransactions)
		.orderBy(desc(unreconciledTransactions.createdAt))
		.limit(20);
}

async function getHousewideOutstandingSummary() {
	const rows = await db
		.select({
			id: housemates.id,
			name: housemates.name,
			isOwner: housemates.isOwner,
			creditBalance: housemates.creditBalance,
			amountOwed: debts.amountOwed,
			amountPaid: debts.amountPaid,
			isPaid: debts.isPaid,
		})
		.from(housemates)
		.leftJoin(debts, eq(debts.housemateId, housemates.id))
		.where(and(eq(housemates.isActive, true), eq(housemates.isOwner, false)));

	const perHousemate = new Map<
		string,
		{ id: string; name: string; amount: number; creditBalance: number }
	>();

	for (const row of rows) {
		const current = perHousemate.get(row.id) ?? {
			id: row.id,
			name: row.name,
			amount: 0,
			creditBalance: row.creditBalance,
		};

		if (row.amountOwed !== null && !row.isPaid) {
			current.amount += Math.max(0, row.amountOwed - (row.amountPaid ?? 0));
		}

		perHousemate.set(row.id, current);
	}

	const housematesWithBalances = [...perHousemate.values()]
		.map((row) => ({
			...row,
			amount: Math.max(0, row.amount - row.creditBalance),
		}))
		.filter((row) => row.amount > 0.009)
		.sort((left, right) => right.amount - left.amount);

	return {
		totalOutstanding: housematesWithBalances.reduce(
			(sum, row) => sum + row.amount,
			0,
		),
		housemates: housematesWithBalances,
	};
}

async function getHousewideBillTypeSummary(billType: AssistantBillType) {
	const rows = await db
		.select({
			housemateId: housemates.id,
			housemateName: housemates.name,
			creditBalance: housemates.creditBalance,
			billId: bills.id,
			billerName: bills.billerName,
			billType: bills.billType,
			dueDate: bills.dueDate,
			billPeriodStart: bills.billPeriodStart,
			billPeriodEnd: bills.billPeriodEnd,
			recurringTemplateName: recurringBills.templateName,
			amountOwed: debts.amountOwed,
			amountPaid: debts.amountPaid,
			isPaid: debts.isPaid,
		})
		.from(housemates)
		.innerJoin(debts, eq(debts.housemateId, housemates.id))
		.innerJoin(bills, eq(bills.id, debts.billId))
		.leftJoin(recurringBills, eq(recurringBills.id, bills.recurringBillId))
		.where(
			and(
				eq(housemates.isActive, true),
				eq(housemates.isOwner, false),
				eq(debts.isPaid, false),
				eq(bills.billType, billType),
			),
		)
		.orderBy(desc(bills.dueDate), desc(bills.createdAt));

	const items = rows
		.map((row) => ({
			housemateId: row.housemateId,
			housemateName: row.housemateName,
			creditBalance: row.creditBalance,
			billId: row.billId,
			label: getBillLabel(row),
			period: formatBillPeriod({
				billPeriodStart: row.billPeriodStart,
				billPeriodEnd: row.billPeriodEnd,
				dueDate: row.dueDate,
			}),
			amountDue: Math.max(0, row.amountOwed - (row.amountPaid ?? 0)),
		}))
		.filter((row) => row.amountDue > 0.009);

	const groupedByHousemate = new Map<
		string,
		{
			housemateId: string;
			housemateName: string;
			totalDue: number;
			creditBalance: number;
			bills: Array<{
				billId: string;
				label: string;
				period: string;
				amountDue: number;
			}>;
		}
	>();

	for (const item of items) {
		const current = groupedByHousemate.get(item.housemateId) ?? {
			housemateId: item.housemateId,
			housemateName: item.housemateName,
			totalDue: 0,
			creditBalance: item.creditBalance,
			bills: [],
		};

		current.totalDue += item.amountDue;
		current.bills.push({
			billId: item.billId,
			label: item.label,
			period: item.period,
			amountDue: item.amountDue,
		});
		groupedByHousemate.set(item.housemateId, current);
	}

	const housematesWithBalances = [...groupedByHousemate.values()]
		.map((housemate) => ({
			...housemate,
			totalDue: Math.max(0, housemate.totalDue - housemate.creditBalance),
		}))
		.filter((housemate) => housemate.totalDue > 0.009)
		.sort((left, right) => right.totalDue - left.totalDue);

	return {
		billType,
		totalDue: housematesWithBalances.reduce(
			(sum, housemate) => sum + housemate.totalDue,
			0,
		),
		housemates: housematesWithBalances,
	};
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

function getMostUrgentHousewideItem(items: HousewideUnpaidItem[]) {
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

async function getBillCollectionRecords(previewDate?: string | null) {
	const rows = await db
		.select({
			billId: bills.id,
			billerName: bills.billerName,
			billType: bills.billType,
			dueDate: bills.dueDate,
			billPeriodStart: bills.billPeriodStart,
			billPeriodEnd: bills.billPeriodEnd,
			recurringTemplateName: recurringBills.templateName,
			housemateId: housemates.id,
			housemateName: housemates.name,
			amountOwed: debts.amountOwed,
			amountPaid: debts.amountPaid,
			isPaid: debts.isPaid,
		})
		.from(bills)
		.innerJoin(debts, eq(debts.billId, bills.id))
		.innerJoin(housemates, eq(housemates.id, debts.housemateId))
		.leftJoin(recurringBills, eq(recurringBills.id, bills.recurringBillId))
		.where(and(eq(housemates.isOwner, false), eq(housemates.isActive, true)))
		.orderBy(desc(bills.dueDate), desc(bills.createdAt));

	const grouped = new Map<
		string,
		{
			billId: string;
			label: string;
			billType: AssistantBillType;
			period: string;
			dueDate: Date;
			billUrl: string | null;
			totalOwed: number;
			totalPaid: number;
			participants: Array<{
				housemateId: string;
				housemateName: string;
				amountOwed: number;
				amountPaid: number;
				remainingAmount: number;
				isPaid: boolean;
			}>;
		}
	>();

	for (const row of rows) {
		const current = grouped.get(row.billId) ?? {
			billId: row.billId,
			label: getBillLabel(row),
			billType: toAssistantBillType(row.billType ?? "other"),
			period: formatBillPeriod({
				billPeriodStart: row.billPeriodStart,
				billPeriodEnd: row.billPeriodEnd,
				dueDate: row.dueDate,
			}),
			dueDate: row.dueDate,
			billUrl: BillPdfStorageService.getAbsoluteViewerUrl(
				row.billId,
				previewDate,
			),
			totalOwed: 0,
			totalPaid: 0,
			participants: [],
		};

		current.totalOwed += row.amountOwed;
		current.totalPaid += row.amountPaid ?? 0;
		current.participants.push({
			housemateId: row.housemateId,
			housemateName: row.housemateName,
			amountOwed: row.amountOwed,
			amountPaid: row.amountPaid ?? 0,
			remainingAmount: Math.max(0, row.amountOwed - (row.amountPaid ?? 0)),
			isPaid: row.isPaid,
		});
		grouped.set(row.billId, current);
	}

	return [...grouped.values()];
}

function findBillCollectionMatch(
	items: Awaited<ReturnType<typeof getBillCollectionRecords>>,
	query: string,
) {
	const normalizedQuery = normalizeText(query);
	if (!normalizedQuery) {
		return null;
	}

	const score = (item: (typeof items)[number]) => {
		const candidateText = normalizeText(
			[item.label, item.period, item.billType, item.billId].join(" "),
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
				score: score(item),
			}))
			.filter((item) => item.score > 0)
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
	const recentPaymentsPromise = getRecentHousematePayments({
		housemateId: context.housemate.id,
	});
	const recentPayments30DayPromise = getRecentHousematePayments({
		housemateId: context.housemate.id,
		limit: 50,
	});
	const latestReceiptPromise = getLatestHousemateReceipt({
		housemateId: context.housemate.id,
		previewDate: context.previewDate,
	});
	const billRecordsPromise = getHousemateBillRecords({
		housemateId: context.housemate.id,
		previewDate: context.previewDate,
	});
	const housewideOutstandingPromise = getHousewideOutstandingSummary();
	const housewideUnpaidItemsPromise = getHousewideUnpaidItems(
		context.previewDate,
	);
	const housewideRecentPaymentsPromise = getHousewideRecentPayments({
		days: DUE_SOON_WINDOW_DAYS,
	});
	const unreconciledTransactionsPromise = getUnreconciledTransactionRows();
	const billCollectionRecordsPromise = getBillCollectionRecords(
		context.previewDate,
	);

	const tools = {
		get_housemate_outstanding_summary: tool({
			description:
				"Get the sender's current unpaid total, unpaid bill count, overdue count, grouped utilities, and pay link.",
			parameters: EMPTY_TOOL_PARAMETERS,
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
			parameters: EMPTY_TOOL_PARAMETERS,
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
			parameters: EMPTY_TOOL_PARAMETERS,
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
			parameters: EMPTY_TOOL_PARAMETERS,
			execute: async () => {
				const page = await payPagePromise;
				return {
					housemateName: page.housemate.name,
					unpaidBillCount: page.summary.billCount,
					overdueBillCount: page.summary.overdueCount,
				};
			},
		}),
		get_bill_breakdown_of_total: tool({
			description:
				"Break down the sender's current unpaid total into a short list of bills with period, amount, and bill link.",
			parameters: EMPTY_TOOL_PARAMETERS,
			execute: async () => {
				const page = await payPagePromise;
				return {
					housemateName: page.housemate.name,
					totalOutstanding: page.paymentProgress.remainingAmount,
					bills: page.items.slice(0, BILL_BREAKDOWN_LIMIT).map((item) => ({
						label: getBillLabel(item),
						period: formatBillPeriod(item),
						amountDue: item.remainingAmount,
						billUrl: item.billUrl,
					})),
					payUrl: page.pageUrl,
				};
			},
		}),
		get_bill_type_total_due: tool({
			description:
				"Get the sender's unpaid total for a bill type such as electricity or gas.",
			parameters: BILL_TYPE_TOOL_PARAMETERS,
			execute: async ({
				billType,
			}: {
				billType: AssistantBillType;
			}) => {
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
			parameters: BILL_TYPE_TOOL_PARAMETERS,
			execute: async ({
				billType,
			}: {
				billType: AssistantBillType;
			}) => {
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
		get_bills_due_by_date_window: tool({
			description:
				"Get the sender's unpaid bills due within a chosen number of days from today. Use this for questions like due this week or before Friday.",
			parameters: DAY_WINDOW_TOOL_PARAMETERS,
			execute: async ({ days }: { days: number }) => {
				const page = await payPagePromise;
				const windowDays = clampWindowDays(days);
				const cutoff = getWindowCutoff(windowDays);
				const dueItems = page.items.filter((item) => item.dueDate <= cutoff);
				return {
					housemateName: page.housemate.name,
					windowDays,
					totalDue: dueItems.reduce(
						(sum, item) => sum + item.remainingAmount,
						0,
					),
					billCount: dueItems.length,
					bills: dueItems.slice(0, BILL_BREAKDOWN_LIMIT).map((item) => ({
						label: getBillLabel(item),
						period: formatBillPeriod(item),
						amountDue: item.remainingAmount,
						dueDate: formatDate(item.dueDate),
						isOverdue: item.isOverdue,
						billUrl: item.billUrl,
					})),
					payUrl: page.pageUrl,
				};
			},
		}),
		get_most_urgent_bill: tool({
			description: "Get the sender's single most urgent unpaid bill.",
			parameters: EMPTY_TOOL_PARAMETERS,
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
		get_oldest_unpaid_bill: tool({
			description: "Get the sender's oldest unpaid bill.",
			parameters: EMPTY_TOOL_PARAMETERS,
			execute: async () => {
				const page = await payPagePromise;
				const item =
					[...page.items].sort(
						(left, right) => left.dueDate.getTime() - right.dueDate.getTime(),
					)[0] ?? null;
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
			parameters: BILL_QUERY_TOOL_PARAMETERS,
			execute: async ({ query }: { query: string }) => {
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
		get_bill_status_by_name: tool({
			description:
				"Find one of the sender's bills by name and return whether it is paid, how much remains, and the bill or receipt link.",
			parameters: BILL_QUERY_TOOL_PARAMETERS,
			execute: async ({ query }: { query: string }) => {
				const records = await billRecordsPromise;
				const match = findBillRecordMatch(records, query);
				if (!match) {
					return {
						housemateName: context.housemate.name,
						found: false,
						query,
					};
				}

				return {
					housemateName: context.housemate.name,
					found: true,
					label: match.label,
					period: match.period,
					isPaid: match.isPaid,
					amountOwed: match.amountOwed,
					amountPaid: match.amountPaid,
					amountRemaining: match.remainingAmount,
					dueDate: formatDate(match.dueDate),
					paidAt: match.paidAt ? formatDate(match.paidAt) : null,
					billUrl: match.billUrl,
					receiptUrl: match.receiptUrl,
				};
			},
		}),
		get_housemate_pay_link: tool({
			description: "Get the sender's pay-all link for current unpaid bills.",
			parameters: EMPTY_TOOL_PARAMETERS,
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
			parameters: EMPTY_TOOL_PARAMETERS,
			execute: async () => {
				const creditBalance = await creditBalancePromise;
				return {
					housemateName: context.housemate.name,
					creditBalance,
					hasCredit: creditBalance > 0.009,
				};
			},
		}),
		get_recent_payment_total: tool({
			description:
				"Get how much the sender has paid in the last chosen number of days, such as 7 or 30 days.",
			parameters: DAY_WINDOW_TOOL_PARAMETERS,
			execute: async ({ days }: { days: number }) => {
				const windowDays = clampWindowDays(days);
				const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
				const recentPayments = await recentPayments30DayPromise;
				const paymentsInWindow = recentPayments.filter(
					(payment) => payment.paidAt >= since,
				);
				return {
					housemateName: context.housemate.name,
					windowDays,
					totalPaid: paymentsInWindow.reduce(
						(sum, payment) => sum + payment.amount,
						0,
					),
					paymentCount: paymentsInWindow.length,
					payments: paymentsInWindow
						.slice(0, RECENT_PAYMENT_LIMIT)
						.map((payment) => ({
							amount: payment.amount,
							description: payment.description,
							paidAt: formatDate(payment.paidAt),
						})),
				};
			},
		}),
		get_recent_payment_summary: tool({
			description:
				"Get the sender's recent matched payments, up to the last 3 payments.",
			parameters: EMPTY_TOOL_PARAMETERS,
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
		get_receipt_for_bill: tool({
			description:
				"Find the sender's latest paid bill matching a bill name and return the receipt link if one exists.",
			parameters: BILL_QUERY_TOOL_PARAMETERS,
			execute: async ({ query }: { query: string }) => {
				const records = await billRecordsPromise;
				const paidMatch = findBillRecordMatch(
					records.filter((record) => record.isPaid && record.receiptUrl),
					query,
				);
				if (!paidMatch) {
					return {
						housemateName: context.housemate.name,
						found: false,
						query,
					};
				}

				return {
					housemateName: context.housemate.name,
					found: true,
					label: paidMatch.label,
					period: paidMatch.period,
					paidAt: paidMatch.paidAt ? formatDate(paidMatch.paidAt) : null,
					amountPaid: paidMatch.amountPaid,
					receiptUrl: paidMatch.receiptUrl,
				};
			},
		}),
		get_latest_receipt_link: tool({
			description: "Get the sender's latest available payment receipt link.",
			parameters: EMPTY_TOOL_PARAMETERS,
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

	if (context.housemate.isOwner) {
		return {
			...tools,
			get_housewide_outstanding_summary: tool({
				description:
					"Get the total outstanding amount for all non-owner housemates, including a short per-housemate breakdown.",
				parameters: EMPTY_TOOL_PARAMETERS,
				execute: async () => {
					const housewideSummary = await housewideOutstandingPromise;
					return {
						totalOutstanding: housewideSummary.totalOutstanding,
						housemates: housewideSummary.housemates.map((housemate) => ({
							name: housemate.name,
							amount: housemate.amount,
						})),
					};
				},
			}),
			get_housewide_overdue_summary: tool({
				description:
					"Get overdue unpaid bills across all non-owner housemates with a short per-housemate breakdown.",
				parameters: EMPTY_TOOL_PARAMETERS,
				execute: async () => {
					const items = (await housewideUnpaidItemsPromise).filter(
						(item) => item.isOverdue,
					);
					const byHousemate = new Map<
						string,
						{ name: string; totalDue: number }
					>();
					for (const item of items) {
						const current = byHousemate.get(item.housemateId) ?? {
							name: item.housemateName,
							totalDue: 0,
						};
						current.totalDue += item.remainingAmount;
						byHousemate.set(item.housemateId, current);
					}

					return {
						totalOverdue: items.reduce(
							(sum, item) => sum + item.remainingAmount,
							0,
						),
						billCount: items.length,
						housemates: [...byHousemate.values()]
							.sort((left, right) => right.totalDue - left.totalDue)
							.map((housemate) => ({
								name: housemate.name,
								totalDue: housemate.totalDue,
							})),
						bills: items.slice(0, BILL_BREAKDOWN_LIMIT).map((item) => ({
							housemateName: item.housemateName,
							label: item.label,
							period: item.period,
							amountDue: item.remainingAmount,
							dueDate: formatDate(item.dueDate),
							billUrl: item.billUrl,
						})),
					};
				},
			}),
			get_housewide_due_soon_summary: tool({
				description:
					"Get unpaid bills due across the house within a chosen number of days from today.",
				parameters: DAY_WINDOW_TOOL_PARAMETERS,
				execute: async ({ days }: { days: number }) => {
					const windowDays = clampWindowDays(days);
					const cutoff = getWindowCutoff(windowDays);
					const items = (
						await getHousewideUnpaidItems(context.previewDate)
					).filter((item) => item.dueDate <= cutoff);
					return {
						windowDays,
						totalDue: items.reduce(
							(sum, item) => sum + item.remainingAmount,
							0,
						),
						billCount: items.length,
						bills: items.slice(0, BILL_BREAKDOWN_LIMIT).map((item) => ({
							housemateName: item.housemateName,
							label: item.label,
							period: item.period,
							amountDue: item.remainingAmount,
							dueDate: formatDate(item.dueDate),
							isOverdue: item.isOverdue,
							billUrl: item.billUrl,
						})),
					};
				},
			}),
			get_housewide_most_urgent_bill: tool({
				description:
					"Get the single most urgent unpaid bill across all non-owner housemates.",
				parameters: EMPTY_TOOL_PARAMETERS,
				execute: async () => {
					const item = getMostUrgentHousewideItem(
						await housewideUnpaidItemsPromise,
					);
					if (!item) {
						return {
							hasUnpaidBills: false,
						};
					}

					return {
						hasUnpaidBills: true,
						housemateName: item.housemateName,
						label: item.label,
						period: item.period,
						amountDue: item.remainingAmount,
						dueDate: formatDate(item.dueDate),
						isOverdue: item.isOverdue,
						billUrl: item.billUrl,
					};
				},
			}),
			get_housewide_bill_type_total_due: tool({
				description:
					"Get the total outstanding amount for all non-owner housemates for one bill type, such as electricity or gas.",
				parameters: BILL_TYPE_TOOL_PARAMETERS,
				execute: async ({
					billType,
				}: {
					billType: AssistantBillType;
				}) => {
					const summary = await getHousewideBillTypeSummary(billType);
					return {
						billType,
						totalDue: summary.totalDue,
						housemates: summary.housemates.map((housemate) => ({
							name: housemate.housemateName,
							amount: housemate.totalDue,
						})),
					};
				},
			}),
			get_housewide_recent_payment_summary: tool({
				description:
					"Get recent matched payments across the house within a chosen number of days.",
				parameters: DAY_WINDOW_TOOL_PARAMETERS,
				execute: async ({ days }: { days: number }) => {
					const windowDays = clampWindowDays(days);
					const payments =
						windowDays === DUE_SOON_WINDOW_DAYS
							? await housewideRecentPaymentsPromise
							: await getHousewideRecentPayments({
									days: windowDays,
								});
					return {
						windowDays,
						totalPaid: payments.reduce(
							(sum, payment) => sum + payment.amount,
							0,
						),
						paymentCount: payments.length,
						payments: payments
							.slice(0, HOUSEWIDE_RECENT_PAYMENT_LIMIT)
							.map((payment) => ({
								housemateName: payment.housemateName,
								amount: payment.amount,
								description: payment.description,
								paidAt: formatDate(payment.paidAt),
							})),
					};
				},
			}),
			get_unreconciled_transactions_summary: tool({
				description:
					"Get a summary of recent unreconciled bank transactions that could not be matched to bills.",
				parameters: EMPTY_TOOL_PARAMETERS,
				execute: async () => {
					const rows = await unreconciledTransactionsPromise;
					return {
						count: rows.length,
						totalAmount: rows.reduce((sum, row) => sum + row.amount, 0),
						transactions: rows
							.slice(0, HOUSEWIDE_RECENT_PAYMENT_LIMIT)
							.map((row) => ({
								transactionId: row.transactionId,
								description: row.description,
								amount: row.amount,
								reason: row.reason,
								createdAt: formatDate(row.createdAt),
							})),
					};
				},
			}),
			get_unreconciled_transaction_details: tool({
				description:
					"Find a recent unreconciled transaction by description or transaction id and return details about why it was not matched.",
				parameters: BILL_QUERY_TOOL_PARAMETERS,
				execute: async ({ query }: { query: string }) => {
					const rows = await unreconciledTransactionsPromise;
					const normalizedQuery = normalizeText(query);
					const match =
						rows.find((row) =>
							normalizeText(
								`${row.transactionId} ${row.description} ${row.reason}`,
							).includes(normalizedQuery),
						) ?? null;

					if (!match) {
						return {
							found: false,
							query,
						};
					}

					return {
						found: true,
						transactionId: match.transactionId,
						description: match.description,
						amount: match.amount,
						reason: match.reason,
						createdAt: formatDate(match.createdAt),
					};
				},
			}),
			get_bill_collection_status: tool({
				description:
					"Find one bill across the house by name and return collection progress, remaining amount, and who has or has not paid.",
				parameters: BILL_QUERY_TOOL_PARAMETERS,
				execute: async ({ query }: { query: string }) => {
					const records = await billCollectionRecordsPromise;
					const match = findBillCollectionMatch(records, query);
					if (!match) {
						return {
							found: false,
							query,
						};
					}

					return {
						found: true,
						label: match.label,
						period: match.period,
						totalOwed: match.totalOwed,
						totalPaid: match.totalPaid,
						totalRemaining: Math.max(0, match.totalOwed - match.totalPaid),
						participantCount: match.participants.length,
						paidCount: match.participants.filter(
							(participant) => participant.isPaid,
						).length,
						unpaidHousemates: match.participants
							.filter((participant) => participant.remainingAmount > 0.009)
							.map((participant) => ({
								name: participant.housemateName,
								amountRemaining: participant.remainingAmount,
							})),
						billUrl: match.billUrl,
					};
				},
			}),
			get_housewide_bill_type_breakdown: tool({
				description:
					"Get a short per-housemate breakdown for one bill type across all non-owner housemates.",
				parameters: BILL_TYPE_TOOL_PARAMETERS,
				execute: async ({
					billType,
				}: {
					billType: AssistantBillType;
				}) => {
					const summary = await getHousewideBillTypeSummary(billType);
					return {
						billType,
						totalDue: summary.totalDue,
						housemates: summary.housemates.map((housemate) => ({
							name: housemate.housemateName,
							totalDue: housemate.totalDue,
							bills: housemate.bills.slice(0, 6),
						})),
					};
				},
			}),
		};
	}

	return tools;
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
				`Today's date is ${formatDate(new Date())}. Convert relative date requests like this week or before Friday into the right day-window tool inputs.`,
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
	buildAssistantUnsupportedSummary,
	buildPaymentClaimRedirectSummary,
	findReferencedHousemate,
	referencesWholeHouse,
};
