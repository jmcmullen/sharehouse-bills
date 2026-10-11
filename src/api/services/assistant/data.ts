import { formatCents } from "../../../lib/money";
import { formatReminderBillLabel } from "../../../lib/reminder-preview";
import type { Account, Bill, Share } from "../account/account";
import { sum } from "../account/compute";
import { BillPdfStorageService } from "../bill-pdf-storage";
import { createAbsoluteDebtReceiptUrl } from "../debt-receipt-page.server";
import { withLedgerClient } from "../payments/client.server";

const DAY_SECONDS = 24 * 60 * 60;
const BILL_TYPE_VALUES = [
	"electricity",
	"gas",
	"internet",
	"phone",
	"water",
	"other",
] as const;

export type AssistantBillType = (typeof BILL_TYPE_VALUES)[number];

// One bill share as the assistant talks about it. Money stays in cents until
// a tool formats it for the reply.
export interface ShareView {
	debtId: string;
	billId: string;
	label: string;
	billType: AssistantBillType;
	period: string;
	dueAt: number;
	amountCents: number;
	paidCents: number;
	remainingCents: number;
	leftCents: number;
	coveredCents: number;
	overdue: boolean;
	settledAt: number | null;
	billUrl: string | null;
	receiptUrl: string | null;
}

export interface HouseShareView extends ShareView {
	housemateId: string;
	housemateName: string;
}

interface BillCollection {
	billId: string;
	label: string;
	billType: AssistantBillType;
	period: string;
	dueAt: number;
	billUrl: string | null;
	bill: Bill;
}

export function billTypeValues() {
	return [...BILL_TYPE_VALUES];
}

export function money(cents: number) {
	return formatCents(cents);
}

export function formatDate(seconds: number) {
	return new Intl.DateTimeFormat("en-AU", {
		day: "numeric",
		month: "short",
		year: "numeric",
	}).format(new Date(seconds * 1000));
}

function formatCompactDate(seconds: number) {
	return new Intl.DateTimeFormat("en-AU", {
		day: "numeric",
		month: "short",
	}).format(new Date(seconds * 1000));
}

export function normalizeText(value: string) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function nowSeconds() {
	return Math.floor(Date.now() / 1000);
}

export function clampWindowDays(days: number) {
	return Math.max(1, Math.min(90, Math.round(days)));
}

export function windowEnd(days: number) {
	return nowSeconds() + clampWindowDays(days) * DAY_SECONDS;
}

export function windowStart(days: number) {
	return nowSeconds() - clampWindowDays(days) * DAY_SECONDS;
}

function toAssistantBillType(value: string | null) {
	return BILL_TYPE_VALUES.find((type) => type === value) ?? "other";
}

function billLabel(item: {
	name: string;
	recurringTemplateName: string | null;
}) {
	return formatReminderBillLabel({
		billerName: item.name,
		recurringTemplateName: item.recurringTemplateName,
	});
}

function billPeriod(item: {
	billPeriodStart: number | null;
	billPeriodEnd: number | null;
	dueAt: number;
}) {
	if (item.billPeriodStart && item.billPeriodEnd)
		return `${formatCompactDate(item.billPeriodStart)} to ${formatCompactDate(item.billPeriodEnd)}`;
	if (item.billPeriodStart)
		return `From ${formatCompactDate(item.billPeriodStart)}`;
	if (item.billPeriodEnd)
		return `Until ${formatCompactDate(item.billPeriodEnd)}`;
	return `Due ${formatCompactDate(item.dueAt)}`;
}

export function toShareView(share: Share, previewDate?: string | null) {
	return {
		debtId: share.id,
		billId: share.billId,
		label: billLabel(share),
		billType: toAssistantBillType(share.billType),
		period: billPeriod(share),
		dueAt: share.dueAt,
		amountCents: share.amountCents,
		paidCents: share.paidCents,
		remainingCents: share.remainingCents,
		leftCents: share.leftCents,
		coveredCents: share.coveredCents,
		overdue: share.overdue,
		settledAt: share.settledAt,
		billUrl: BillPdfStorageService.getAbsoluteViewerUrl(
			share.billId,
			previewDate,
		),
		receiptUrl:
			share.settledAt === null
				? null
				: createAbsoluteDebtReceiptUrl({ debtId: share.id }, previewDate),
	} satisfies ShareView;
}

// Shares still to pay once held credit is applied, most recent due first.
export function owingViews(account: Account, previewDate?: string | null) {
	return account.shares
		.filter((share) => share.leftCents > 0)
		.map((share) => toShareView(share, previewDate))
		.sort((left, right) => right.dueAt - left.dueAt);
}

export function totalLeft(items: Array<{ leftCents: number }>) {
	return sum(items, (item) => item.leftCents);
}

export function houseOwingViews(
	accounts: Account[],
	previewDate?: string | null,
): HouseShareView[] {
	return accounts
		.filter((account) => !account.housemate.isOwner)
		.flatMap((account) =>
			owingViews(account, previewDate).map((view) => ({
				...view,
				housemateId: account.housemate.id,
				housemateName: account.housemate.name,
			})),
		)
		.sort((left, right) => right.dueAt - left.dueAt);
}

export function byHousemate(items: HouseShareView[]) {
	return [
		...items
			.reduce(
				(groups, item) =>
					new Map(groups).set(item.housemateId, [
						...(groups.get(item.housemateId) ?? []),
						item,
					]),
				new Map<string, HouseShareView[]>(),
			)
			.values(),
	]
		.map((group) => ({
			name: group[0].housemateName,
			totalCents: totalLeft(group),
			bills: group,
		}))
		.sort((left, right) => right.totalCents - left.totalCents);
}

export function mostUrgent<T extends ShareView>(items: T[]): T | null {
	return (
		[...items].sort(
			(left, right) =>
				Number(right.overdue) - Number(left.overdue) ||
				left.dueAt - right.dueAt ||
				right.leftCents - left.leftCents,
		)[0] ?? null
	);
}

function matchScore(text: string, query: string) {
	const candidate = normalizeText(text);
	if (candidate === query) return 4;
	if (candidate.startsWith(query)) return 3;
	if (candidate.includes(query)) return 2;
	return query.split(" ").every((token) => candidate.includes(token)) ? 1 : 0;
}

// The best match for a bill name, preferring unpaid then the oldest due.
export function findByName<T extends { dueAt: number }>(
	items: T[],
	query: string,
	text: (item: T) => string,
	isPaid: (item: T) => boolean = () => false,
): T | null {
	const normalized = normalizeText(query);
	if (!normalized) return null;
	return (
		items
			.map((item) => ({ item, score: matchScore(text(item), normalized) }))
			.filter((result) => result.score > 0)
			.sort(
				(left, right) =>
					right.score - left.score ||
					Number(isPaid(left.item)) - Number(isPaid(right.item)) ||
					left.item.dueAt - right.item.dueAt,
			)[0]?.item ?? null
	);
}

export function shareText(item: ShareView) {
	return [item.label, item.period, item.billType, item.billId].join(" ");
}

export function toBillCollection(
	bill: Bill,
	previewDate?: string | null,
): BillCollection {
	return {
		billId: bill.id,
		label: billLabel(bill),
		billType: toAssistantBillType(bill.billType),
		period: billPeriod(bill),
		dueAt: bill.dueAt,
		billUrl: BillPdfStorageService.getAbsoluteViewerUrl(bill.id, previewDate),
		bill,
	};
}

// Bank transactions waiting for a decision on the payment review page.
export async function getReviewTransactions() {
	const rows = await withLedgerClient((client) =>
		client.execute(
			"SELECT id,description,message,amount_cents,reason,effective_at FROM bank_transactions WHERE decision='review' ORDER BY effective_at DESC LIMIT 20",
		),
	);
	return rows.rows.map((row) => ({
		transactionId: String(row.id),
		description: [row.description, row.message]
			.filter(Boolean)
			.map(String)
			.join(" · "),
		amountCents: Number(row.amount_cents),
		reason: String(row.reason),
		receivedAt: Number(row.effective_at),
	}));
}
