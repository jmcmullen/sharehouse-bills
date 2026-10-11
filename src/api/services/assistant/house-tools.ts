import { tool } from "ai";
import { loadAccounts, loadBills } from "../account/account.server";
import { sum } from "../account/compute";
import {
	type AssistantBillType,
	type HouseShareView,
	byHousemate,
	clampWindowDays,
	findByName,
	formatDate,
	getReviewTransactions,
	houseOwingViews,
	money,
	mostUrgent,
	normalizeText,
	toBillCollection,
	totalLeft,
	windowEnd,
	windowStart,
} from "./data";
import type { AssistantToolContext } from "./own-tools";
import {
	BILL_QUERY_TOOL_PARAMETERS,
	BILL_TYPE_TOOL_PARAMETERS,
	DAY_WINDOW_TOOL_PARAMETERS,
	EMPTY_TOOL_PARAMETERS,
} from "./parameters";

const HOUSEWIDE_RECENT_PAYMENT_LIMIT = 5;
const BILL_BREAKDOWN_LIMIT = 8;

function houseBillLine(item: HouseShareView) {
	return {
		housemateName: item.housemateName,
		label: item.label,
		period: item.period,
		amountDue: money(item.leftCents),
		dueDate: formatDate(item.dueAt),
		isOverdue: item.overdue,
		billUrl: item.billUrl,
	};
}

function housemateTotals(items: HouseShareView[]) {
	return byHousemate(items).map((group) => ({
		name: group.name,
		amount: money(group.totalCents),
	}));
}

// Tools only the house admin gets: every housemate's figures at once.
export function createHouseTools(context: AssistantToolContext) {
	const accountsPromise = loadAccounts();
	const owing = async () =>
		houseOwingViews(await accountsPromise, context.previewDate);
	const ofType = async (billType: AssistantBillType) =>
		(await owing()).filter((item) => item.billType === billType);
	const reviewPromise = getReviewTransactions();

	return {
		get_housewide_outstanding_summary: tool({
			description:
				"Get the total outstanding amount after credit for all non-owner housemates, including a short per-housemate breakdown.",
			parameters: EMPTY_TOOL_PARAMETERS,
			execute: async () => {
				const items = await owing();
				return {
					totalOutstanding: money(totalLeft(items)),
					housemates: housemateTotals(items),
				};
			},
		}),
		get_housewide_overdue_summary: tool({
			description:
				"Get overdue unpaid bills across all non-owner housemates with a short per-housemate breakdown.",
			parameters: EMPTY_TOOL_PARAMETERS,
			execute: async () => {
				const items = (await owing()).filter((item) => item.overdue);
				return {
					totalOverdue: money(totalLeft(items)),
					billCount: items.length,
					housemates: byHousemate(items).map((group) => ({
						name: group.name,
						totalDue: money(group.totalCents),
					})),
					bills: items.slice(0, BILL_BREAKDOWN_LIMIT).map(houseBillLine),
				};
			},
		}),
		get_housewide_due_soon_summary: tool({
			description:
				"Get unpaid bills due across the house within a chosen number of days from today.",
			parameters: DAY_WINDOW_TOOL_PARAMETERS,
			execute: async ({ days }: { days: number }) => {
				const cutoff = windowEnd(days);
				const items = (await owing()).filter((item) => item.dueAt <= cutoff);
				return {
					windowDays: clampWindowDays(days),
					totalDue: money(totalLeft(items)),
					billCount: items.length,
					bills: items.slice(0, BILL_BREAKDOWN_LIMIT).map(houseBillLine),
				};
			},
		}),
		get_housewide_most_urgent_bill: tool({
			description:
				"Get the single most urgent unpaid bill across all non-owner housemates.",
			parameters: EMPTY_TOOL_PARAMETERS,
			execute: async () => {
				const item = mostUrgent(await owing());
				return item
					? { hasUnpaidBills: true, ...houseBillLine(item) }
					: { hasUnpaidBills: false };
			},
		}),
		get_housewide_bill_type_total_due: tool({
			description:
				"Get the total outstanding amount for all non-owner housemates for one bill type, such as electricity or gas.",
			parameters: BILL_TYPE_TOOL_PARAMETERS,
			execute: async ({ billType }: { billType: AssistantBillType }) => {
				const items = await ofType(billType);
				return {
					billType,
					totalDue: money(totalLeft(items)),
					housemates: housemateTotals(items),
				};
			},
		}),
		get_housewide_bill_type_breakdown: tool({
			description:
				"Get a short per-housemate breakdown for one bill type across all non-owner housemates.",
			parameters: BILL_TYPE_TOOL_PARAMETERS,
			execute: async ({ billType }: { billType: AssistantBillType }) => {
				const items = await ofType(billType);
				return {
					billType,
					totalDue: money(totalLeft(items)),
					housemates: byHousemate(items).map((group) => ({
						name: group.name,
						totalDue: money(group.totalCents),
						bills: group.bills.slice(0, 6).map((item) => ({
							billId: item.billId,
							label: item.label,
							period: item.period,
							amountDue: money(item.leftCents),
						})),
					})),
				};
			},
		}),
		get_housewide_recent_payment_summary: tool({
			description:
				"Get recent payments received across the house within a chosen number of days.",
			parameters: DAY_WINDOW_TOOL_PARAMETERS,
			execute: async ({ days }: { days: number }) => {
				const since = windowStart(days);
				const payments = (await accountsPromise)
					.filter((account) => !account.housemate.isOwner)
					.flatMap((account) =>
						account.receipts
							.filter(
								(receipt) =>
									receipt.amountCents > 0 && receipt.receivedAt >= since,
							)
							.map((receipt) => ({
								housemateName: account.housemate.name,
								amountCents: receipt.amountCents,
								receivedAt: receipt.receivedAt,
							})),
					)
					.sort((left, right) => right.receivedAt - left.receivedAt);
				return {
					windowDays: clampWindowDays(days),
					totalPaid: money(sum(payments, (payment) => payment.amountCents)),
					paymentCount: payments.length,
					payments: payments
						.slice(0, HOUSEWIDE_RECENT_PAYMENT_LIMIT)
						.map((payment) => ({
							housemateName: payment.housemateName,
							amount: money(payment.amountCents),
							paidAt: formatDate(payment.receivedAt),
						})),
				};
			},
		}),
		get_unreconciled_transactions_summary: tool({
			description:
				"Get a summary of recent bank transactions waiting for payment review.",
			parameters: EMPTY_TOOL_PARAMETERS,
			execute: async () => {
				const rows = await reviewPromise;
				return {
					count: rows.length,
					totalAmount: money(sum(rows, (row) => row.amountCents)),
					transactions: rows
						.slice(0, HOUSEWIDE_RECENT_PAYMENT_LIMIT)
						.map((row) => ({
							transactionId: row.transactionId,
							description: row.description,
							amount: money(row.amountCents),
							reason: row.reason,
							createdAt: formatDate(row.receivedAt),
						})),
				};
			},
		}),
		get_unreconciled_transaction_details: tool({
			description:
				"Find a bank transaction waiting for review by description or transaction id and return why it needs a decision.",
			parameters: BILL_QUERY_TOOL_PARAMETERS,
			execute: async ({ query }: { query: string }) => {
				const normalized = normalizeText(query);
				const match = (await reviewPromise).find((row) =>
					normalizeText(
						`${row.transactionId} ${row.description} ${row.reason}`,
					).includes(normalized),
				);
				return match
					? {
							found: true,
							transactionId: match.transactionId,
							description: match.description,
							amount: money(match.amountCents),
							reason: match.reason,
							createdAt: formatDate(match.receivedAt),
						}
					: { found: false, query };
			},
		}),
		get_bill_collection_status: tool({
			description:
				"Find one bill across the house by name and return collection progress, remaining amount, and who has or has not paid.",
			parameters: BILL_QUERY_TOOL_PARAMETERS,
			execute: async ({ query }: { query: string }) => {
				const bills = (await loadBills()).map((bill) =>
					toBillCollection(bill, context.previewDate),
				);
				const match = findByName(bills, query, (item) =>
					[item.label, item.period, item.billType, item.billId].join(" "),
				);
				if (!match) return { found: false, query };
				const shares = match.bill.shares.filter((share) => !share.isOwner);
				return {
					found: true,
					label: match.label,
					period: match.period,
					status: match.bill.status,
					billTotal: money(match.bill.totalCents),
					totalPaid: money(match.bill.paidCents),
					totalRemaining: money(match.bill.remainingCents),
					participantCount: shares.length,
					paidCount: shares.filter((share) => share.remainingCents === 0)
						.length,
					unpaidHousemates: shares
						.filter((share) => share.remainingCents > 0)
						.map((share) => ({
							name: share.housemateName,
							amountRemaining: money(share.remainingCents),
						})),
					billUrl: match.billUrl,
				};
			},
		}),
	};
}
