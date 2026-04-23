import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../api/db/index.server";
import { bills } from "../api/db/schema/bills";
import { debts } from "../api/db/schema/debts";
import { housemates } from "../api/db/schema/housemates";
import { paymentTransactions } from "../api/db/schema/payment-transactions";
import { getRemainingDebtAmount } from "../api/services/debt-payment-state";
import { authMiddleware } from "../lib/auth-middleware";

const RECENT_PAYMENT_LIMIT = 50;
const RECENT_WINDOW_DAYS = 30;

type PaymentTransactionColumns = {
	hasSource: boolean;
	hasCreditAmount: boolean;
};

type PaymentSource = "up_bank" | "manual_reconciliation" | "manual_admin";

type PaymentRowWithSource = {
	id: string;
	transactionId: string;
	housemateId: string;
	housemateName: string;
	description: string;
	amount: number;
	source: PaymentSource;
	matchType: PaymentListItem["matchType"];
	creditAmount: number;
	settledAt: Date | null;
	upCreatedAt: Date | null;
	createdAt: Date;
	matchedDebtIds: string[] | null;
};

type PaymentRowWithoutSource = {
	id: string;
	transactionId: string;
	housemateId: string;
	housemateName: string;
	description: string;
	amount: number;
	matchType: PaymentListItem["matchType"];
	settledAt: Date | null;
	upCreatedAt: Date | null;
	createdAt: Date;
	matchedDebtIds: string[] | null;
};

export interface PaymentListItem {
	id: string;
	transactionId: string;
	housemateId: string;
	housemateName: string;
	description: string;
	amount: number;
	source: "up_bank" | "manual_reconciliation" | "manual_admin";
	matchType:
		| "exact_match"
		| "combination_match"
		| "partial_allocation"
		| "credit_created"
		| "manual_match"
		| "no_match"
		| "ambiguous_match"
		| "insufficient_data"
		| "ignored";
	creditAmount: number;
	paidAt: Date;
	appliedBillNames: string[];
}

export interface PaymentsSummary {
	recentAmount: number;
	recentCount: number;
	outstandingAmount: number;
	creditBalance: number;
}

function getPaymentEffectiveDate(payment: {
	settledAt: Date | null;
	upCreatedAt: Date | null;
	createdAt: Date;
}) {
	return payment.settledAt ?? payment.upCreatedAt ?? payment.createdAt;
}

async function getPaymentTransactionColumns(): Promise<PaymentTransactionColumns> {
	const result = await db.$client.execute(
		"PRAGMA table_info(payment_transactions)",
	);
	const columnNames = new Set(
		result.rows.map((row) => String(row.name).toLowerCase()),
	);

	return {
		hasSource: columnNames.has("source"),
		hasCreditAmount: columnNames.has("credit_amount"),
	};
}

function getFallbackSource(
	matchType: PaymentListItem["matchType"],
): PaymentSource {
	if (matchType === "manual_match") {
		return "manual_reconciliation";
	}

	return "up_bank";
}

function normalizePaymentRow(
	payment: PaymentRowWithSource | PaymentRowWithoutSource,
	billNamesByDebtId: Map<string, string>,
): PaymentListItem {
	const source: PaymentSource =
		"source" in payment ? payment.source : getFallbackSource(payment.matchType);
	const creditAmount = "creditAmount" in payment ? payment.creditAmount : 0;

	return {
		id: payment.id,
		transactionId: payment.transactionId,
		housemateId: payment.housemateId,
		housemateName: payment.housemateName,
		description: payment.description,
		amount: payment.amount,
		source,
		matchType: payment.matchType,
		creditAmount,
		paidAt: getPaymentEffectiveDate(payment),
		appliedBillNames: Array.from(
			new Set(
				(payment.matchedDebtIds ?? [])
					.map((debtId) => billNamesByDebtId.get(debtId))
					.filter((billerName): billerName is string => Boolean(billerName)),
			),
		),
	};
}

export const getRecentPayments = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async () => {
		const columns = await getPaymentTransactionColumns();
		const paymentRows: PaymentRowWithSource[] | PaymentRowWithoutSource[] =
			columns.hasSource && columns.hasCreditAmount
				? await db
						.select({
							id: paymentTransactions.id,
							transactionId: paymentTransactions.transactionId,
							housemateId: housemates.id,
							housemateName: housemates.name,
							description: paymentTransactions.description,
							amount: paymentTransactions.amount,
							source: paymentTransactions.source,
							matchType: paymentTransactions.matchType,
							creditAmount: paymentTransactions.creditAmount,
							settledAt: paymentTransactions.settledAt,
							upCreatedAt: paymentTransactions.upCreatedAt,
							createdAt: paymentTransactions.createdAt,
							matchedDebtIds: paymentTransactions.matchedDebtIds,
						})
						.from(paymentTransactions)
						.innerJoin(
							housemates,
							eq(housemates.id, paymentTransactions.housemateId),
						)
						.where(
							and(
								eq(paymentTransactions.status, "matched"),
								eq(housemates.isOwner, false),
							),
						)
						.orderBy(
							desc(paymentTransactions.settledAt),
							desc(paymentTransactions.upCreatedAt),
							desc(paymentTransactions.createdAt),
						)
						.limit(RECENT_PAYMENT_LIMIT)
				: await db
						.select({
							id: paymentTransactions.id,
							transactionId: paymentTransactions.transactionId,
							housemateId: housemates.id,
							housemateName: housemates.name,
							description: paymentTransactions.description,
							amount: paymentTransactions.amount,
							matchType: paymentTransactions.matchType,
							settledAt: paymentTransactions.settledAt,
							upCreatedAt: paymentTransactions.upCreatedAt,
							createdAt: paymentTransactions.createdAt,
							matchedDebtIds: paymentTransactions.matchedDebtIds,
						})
						.from(paymentTransactions)
						.innerJoin(
							housemates,
							eq(housemates.id, paymentTransactions.housemateId),
						)
						.where(
							and(
								eq(paymentTransactions.status, "matched"),
								eq(housemates.isOwner, false),
							),
						)
						.orderBy(
							desc(paymentTransactions.settledAt),
							desc(paymentTransactions.upCreatedAt),
							desc(paymentTransactions.createdAt),
						)
						.limit(RECENT_PAYMENT_LIMIT);

		const matchedDebtIds = Array.from(
			new Set(
				paymentRows
					.flatMap((payment) => payment.matchedDebtIds ?? [])
					.filter(Boolean),
			),
		);
		const debtRows =
			matchedDebtIds.length > 0
				? await db
						.select({
							debtId: debts.id,
							billerName: bills.billerName,
						})
						.from(debts)
						.innerJoin(bills, eq(bills.id, debts.billId))
						.where(inArray(debts.id, matchedDebtIds))
				: [];
		const billNamesByDebtId = new Map(
			debtRows.map((row) => [row.debtId, row.billerName]),
		);
		const payments = paymentRows.map((payment) =>
			normalizePaymentRow(payment, billNamesByDebtId),
		);

		const housemateRows = await db
			.select({
				id: housemates.id,
				creditBalance: housemates.creditBalance,
				debt: debts,
			})
			.from(housemates)
			.leftJoin(debts, eq(debts.housemateId, housemates.id))
			.where(eq(housemates.isOwner, false));
		const balances = Array.from(
			housemateRows
				.reduce(
					(map, row) => {
						const existing = map.get(row.id) ?? {
							creditBalance: row.creditBalance,
							outstandingAmount: 0,
						};

						if (row.debt) {
							existing.outstandingAmount += getRemainingDebtAmount(row.debt);
						}

						map.set(row.id, existing);
						return map;
					},
					new Map<
						string,
						{
							creditBalance: number;
							outstandingAmount: number;
						}
					>(),
				)
				.values(),
		);
		const recentThreshold = new Date();
		recentThreshold.setDate(recentThreshold.getDate() - RECENT_WINDOW_DAYS);

		return {
			payments,
			summary: {
				recentAmount: payments
					.filter((payment) => payment.paidAt >= recentThreshold)
					.reduce((sum, payment) => sum + payment.amount, 0),
				recentCount: payments.filter(
					(payment) => payment.paidAt >= recentThreshold,
				).length,
				outstandingAmount: balances.reduce((sum, balance) => {
					return (
						sum + Math.max(0, balance.outstandingAmount - balance.creditBalance)
					);
				}, 0),
				creditBalance: balances.reduce((sum, balance) => {
					return sum + Math.max(0, balance.creditBalance);
				}, 0),
			} satisfies PaymentsSummary,
		};
	});
