import { tool } from "ai";
import type { Account } from "../account/account";
import { loadAccount } from "../account/account.server";
import { sum } from "../account/compute";
import { createAbsolutePayUrl } from "../pay-token.server";
import {
	type AssistantBillType,
	type ShareView,
	clampWindowDays,
	findByName,
	formatDate,
	money,
	mostUrgent,
	owingViews,
	shareText,
	toShareView,
	totalLeft,
	windowEnd,
	windowStart,
} from "./data";
import {
	BILL_QUERY_TOOL_PARAMETERS,
	BILL_TYPE_TOOL_PARAMETERS,
	DAY_WINDOW_TOOL_PARAMETERS,
	EMPTY_TOOL_PARAMETERS,
} from "./parameters";

const DUE_SOON_WINDOW_DAYS = 7;
const RECENT_PAYMENT_LIMIT = 3;
const BILL_BREAKDOWN_LIMIT = 8;
const UTILITY_LABELS: Partial<Record<AssistantBillType, string>> = {
	electricity: "Electricity",
	gas: "Gas",
};

export interface AssistantToolContext {
	housemate: { id: string; name: string; isOwner?: boolean };
	previewDate?: string | null;
}

function billLine(item: ShareView) {
	return {
		label: item.label,
		period: item.period,
		amountDue: money(item.leftCents),
		dueDate: formatDate(item.dueAt),
		isOverdue: item.overdue,
		billUrl: item.billUrl,
	};
}

function utilityGroups(items: ShareView[]) {
	return Object.entries(UTILITY_LABELS).flatMap(([type, label]) => {
		const group = items.filter((item) => item.billType === type);
		return group.length
			? [{ label, total: money(totalLeft(group)), billCount: group.length }]
			: [];
	});
}

function receivedPayments(account: Account | null) {
	return (account?.receipts ?? []).filter((receipt) => receipt.amountCents > 0);
}

function paymentLine(payment: Account["receipts"][number]) {
	return {
		amount: money(payment.amountCents),
		description: payment.description,
		paidAt: formatDate(payment.receivedAt),
		billCount: payment.allocations.length,
	};
}

// Tools that answer about the target housemate's own account.
export function createOwnTools(context: AssistantToolContext) {
	const name = context.housemate.name;
	const accountPromise = loadAccount(context.housemate.id);
	const payUrl = createAbsolutePayUrl(
		{ housemateId: context.housemate.id },
		context.previewDate,
	);
	const owing = async () => {
		const account = await accountPromise;
		return account ? owingViews(account, context.previewDate) : [];
	};
	const allShares = async () =>
		((await accountPromise)?.shares ?? []).map((share) =>
			toShareView(share, context.previewDate),
		);
	const ofType = async (billType: AssistantBillType) =>
		(await owing()).filter((item) => item.billType === billType);

	return {
		get_housemate_outstanding_summary: tool({
			description:
				"Get the sender's current unpaid total after credit, unpaid bill count, overdue count, grouped utilities, and pay link.",
			parameters: EMPTY_TOOL_PARAMETERS,
			execute: async () => {
				const items = await owing();
				return {
					housemateName: name,
					totalOutstanding: money(totalLeft(items)),
					unpaidBillCount: items.length,
					overdueBillCount: items.filter((item) => item.overdue).length,
					utilityGroups: utilityGroups(items),
					payUrl,
				};
			},
		}),
		get_overdue_summary: tool({
			description:
				"Get only the sender's overdue unpaid bills and overdue total.",
			parameters: EMPTY_TOOL_PARAMETERS,
			execute: async () => {
				const items = (await owing()).filter((item) => item.overdue);
				return {
					housemateName: name,
					overdueTotal: money(totalLeft(items)),
					overdueCount: items.length,
					bills: items.slice(0, 6).map(billLine),
					payUrl,
				};
			},
		}),
		get_due_soon_summary: tool({
			description:
				"Get the sender's unpaid bills due in the next 7 days, excluding already overdue bills.",
			parameters: EMPTY_TOOL_PARAMETERS,
			execute: async () => {
				const cutoff = windowEnd(DUE_SOON_WINDOW_DAYS);
				const items = (await owing()).filter(
					(item) => !item.overdue && item.dueAt <= cutoff,
				);
				return {
					housemateName: name,
					windowDays: DUE_SOON_WINDOW_DAYS,
					dueSoonTotal: money(totalLeft(items)),
					dueSoonCount: items.length,
					bills: items.slice(0, 6).map(billLine),
					payUrl,
				};
			},
		}),
		get_unpaid_bill_count: tool({
			description: "Get the sender's current unpaid bill count.",
			parameters: EMPTY_TOOL_PARAMETERS,
			execute: async () => {
				const items = await owing();
				return {
					housemateName: name,
					unpaidBillCount: items.length,
					overdueBillCount: items.filter((item) => item.overdue).length,
				};
			},
		}),
		get_bill_breakdown_of_total: tool({
			description:
				"Break down the sender's current unpaid total into a short list of bills with period, amount, and bill link.",
			parameters: EMPTY_TOOL_PARAMETERS,
			execute: async () => {
				const items = await owing();
				return {
					housemateName: name,
					totalOutstanding: money(totalLeft(items)),
					bills: items.slice(0, BILL_BREAKDOWN_LIMIT).map(billLine),
					payUrl,
				};
			},
		}),
		get_bill_type_total_due: tool({
			description:
				"Get the sender's unpaid total for a bill type such as electricity or gas.",
			parameters: BILL_TYPE_TOOL_PARAMETERS,
			execute: async ({ billType }: { billType: AssistantBillType }) => {
				const items = await ofType(billType);
				return {
					housemateName: name,
					billType,
					totalDue: money(totalLeft(items)),
					billCount: items.length,
				};
			},
		}),
		get_bill_type_breakdown: tool({
			description:
				"Get a short period-and-amount breakdown for one bill type such as electricity or gas.",
			parameters: BILL_TYPE_TOOL_PARAMETERS,
			execute: async ({ billType }: { billType: AssistantBillType }) => {
				const items = await ofType(billType);
				return {
					housemateName: name,
					billType,
					totalDue: money(totalLeft(items)),
					bills: items.slice(0, 8).map((item) => ({
						period: item.period,
						amountDue: money(item.leftCents),
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
				const cutoff = windowEnd(days);
				const items = (await owing()).filter((item) => item.dueAt <= cutoff);
				return {
					housemateName: name,
					windowDays: clampWindowDays(days),
					totalDue: money(totalLeft(items)),
					billCount: items.length,
					bills: items.slice(0, BILL_BREAKDOWN_LIMIT).map(billLine),
					payUrl,
				};
			},
		}),
		get_most_urgent_bill: tool({
			description: "Get the sender's single most urgent unpaid bill.",
			parameters: EMPTY_TOOL_PARAMETERS,
			execute: async () => {
				const item = mostUrgent(await owing());
				return item
					? { housemateName: name, hasUnpaidBills: true, ...billLine(item) }
					: { housemateName: name, hasUnpaidBills: false };
			},
		}),
		get_oldest_unpaid_bill: tool({
			description: "Get the sender's oldest unpaid bill.",
			parameters: EMPTY_TOOL_PARAMETERS,
			execute: async () => {
				const item = (await owing()).at(-1);
				return item
					? { housemateName: name, hasUnpaidBills: true, ...billLine(item) }
					: { housemateName: name, hasUnpaidBills: false };
			},
		}),
		get_bill_link_by_name: tool({
			description:
				"Find one of the sender's unpaid bills by a biller or template name and return its individual bill link.",
			parameters: BILL_QUERY_TOOL_PARAMETERS,
			execute: async ({ query }: { query: string }) => {
				const match = findByName(await owing(), query, shareText);
				return match
					? {
							housemateName: name,
							found: true,
							label: match.label,
							period: match.period,
							amountDue: money(match.leftCents),
							billUrl: match.billUrl,
						}
					: { housemateName: name, found: false, query };
			},
		}),
		get_bill_status_by_name: tool({
			description:
				"Find one of the sender's bills by name and return whether it is paid, how much remains, and the bill or receipt link.",
			parameters: BILL_QUERY_TOOL_PARAMETERS,
			execute: async ({ query }: { query: string }) => {
				const match = findByName(
					await allShares(),
					query,
					shareText,
					(item) => item.remainingCents === 0,
				);
				if (!match) return { housemateName: name, found: false, query };
				return {
					housemateName: name,
					found: true,
					label: match.label,
					period: match.period,
					isPaid: match.remainingCents === 0,
					amountOwed: money(match.amountCents),
					amountPaid: money(match.paidCents),
					amountRemaining: money(match.remainingCents),
					coveredByCredit: money(match.coveredCents),
					dueDate: formatDate(match.dueAt),
					paidAt: match.settledAt === null ? null : formatDate(match.settledAt),
					billUrl: match.billUrl,
					receiptUrl: match.receiptUrl,
				};
			},
		}),
		get_housemate_pay_link: tool({
			description: "Get the sender's pay-all link for current unpaid bills.",
			parameters: EMPTY_TOOL_PARAMETERS,
			execute: async () => ({
				housemateName: name,
				totalOutstanding: money(totalLeft(await owing())),
				payUrl,
			}),
		}),
		get_housemate_credit_balance: tool({
			description:
				"Get the sender's money held as credit and how much of it already covers unpaid bills.",
			parameters: EMPTY_TOOL_PARAMETERS,
			execute: async () => {
				const account = await accountPromise;
				const creditCents = Math.max(0, account?.creditCents ?? 0);
				return {
					housemateName: name,
					creditBalance: money(creditCents),
					appliedToBills: money(account?.coveredCents ?? 0),
					hasCredit: creditCents > 0,
				};
			},
		}),
		get_recent_payment_total: tool({
			description:
				"Get how much the sender has paid in the last chosen number of days, such as 7 or 30 days.",
			parameters: DAY_WINDOW_TOOL_PARAMETERS,
			execute: async ({ days }: { days: number }) => {
				const since = windowStart(days);
				const payments = receivedPayments(await accountPromise).filter(
					(payment) => payment.receivedAt >= since,
				);
				return {
					housemateName: name,
					windowDays: clampWindowDays(days),
					totalPaid: money(sum(payments, (payment) => payment.amountCents)),
					paymentCount: payments.length,
					payments: payments.slice(0, RECENT_PAYMENT_LIMIT).map(paymentLine),
				};
			},
		}),
		get_recent_payment_summary: tool({
			description:
				"Get the sender's recent payments received, up to the last 3 payments.",
			parameters: EMPTY_TOOL_PARAMETERS,
			execute: async () => ({
				housemateName: name,
				payments: receivedPayments(await accountPromise)
					.slice(0, RECENT_PAYMENT_LIMIT)
					.map(paymentLine),
			}),
		}),
		get_receipt_for_bill: tool({
			description:
				"Find the sender's latest paid bill matching a bill name and return the receipt link if one exists.",
			parameters: BILL_QUERY_TOOL_PARAMETERS,
			execute: async ({ query }: { query: string }) => {
				const match = findByName(
					(await allShares()).filter((item) => item.receiptUrl),
					query,
					shareText,
				);
				return match
					? {
							housemateName: name,
							found: true,
							label: match.label,
							period: match.period,
							paidAt:
								match.settledAt === null ? null : formatDate(match.settledAt),
							amountPaid: money(match.paidCents),
							receiptUrl: match.receiptUrl,
						}
					: { housemateName: name, found: false, query };
			},
		}),
		get_latest_receipt_link: tool({
			description: "Get the sender's latest available payment receipt link.",
			parameters: EMPTY_TOOL_PARAMETERS,
			execute: async () => {
				const latest = (await allShares())
					.flatMap((item) =>
						item.settledAt === null ? [] : [{ ...item, at: item.settledAt }],
					)
					.sort((left, right) => right.at - left.at)[0];
				return latest
					? {
							housemateName: name,
							found: true,
							label: latest.label,
							period: latest.period,
							amountPaid: money(latest.paidCents),
							paidAt: formatDate(latest.at),
							receiptUrl: latest.receiptUrl,
						}
					: { housemateName: name, found: false };
			},
		}),
	};
}
