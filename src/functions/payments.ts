// fallow-ignore-file code-duplication
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../api/db/index.server";
import { bills } from "../api/db/schema/bills";
import { debts } from "../api/db/schema/debts";
import { housemates } from "../api/db/schema/housemates";
import { paymentTransactions } from "../api/db/schema/payment-transactions";
import { getRemainingDebtAmount } from "../api/services/debt-payment-state";
import { getUnallocatedCredits } from "../api/services/ledger/credit.server";
import { authMiddleware } from "../lib/auth-middleware";

const RECENT_PAYMENT_LIMIT = 50;
const RECENT_WINDOW_DAYS = 30;

interface PaymentListItem {
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

interface PaymentsSummary {
	recentAmount: number;
	recentCount: number;
	outstandingAmount: number;
	unallocatedCredit: number;
}

function getPaymentEffectiveDate(payment: {
	settledAt: Date | null;
	upCreatedAt: Date | null;
	createdAt: Date;
}) {
	return payment.settledAt ?? payment.upCreatedAt ?? payment.createdAt;
}

export const getRecentPayments = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async () => {
		const paymentRows = await db
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
			.innerJoin(housemates, eq(housemates.id, paymentTransactions.housemateId))
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
		const payments = paymentRows.map(
			(payment): PaymentListItem => ({
				...payment,
				paidAt: getPaymentEffectiveDate(payment),
				appliedBillNames: Array.from(
					new Set(
						(payment.matchedDebtIds ?? []).flatMap((debtId) => {
							const name = billNamesByDebtId.get(debtId);
							return name ? [name] : [];
						}),
					),
				),
			}),
		);

		const housemateRows = await db
			.select({
				id: housemates.id,
				debt: debts,
			})
			.from(housemates)
			.leftJoin(debts, eq(debts.housemateId, housemates.id))
			.where(eq(housemates.isOwner, false));
		const credits = await getUnallocatedCredits(
			housemateRows.map((row) => row.id),
		);
		const balances = Array.from(
			housemateRows
				.reduce((map, row) => {
					const existing = map.get(row.id) ?? {
						credit: credits.get(row.id) ?? 0,
						outstandingAmount: 0,
					};

					if (row.debt) {
						existing.outstandingAmount += getRemainingDebtAmount(row.debt);
					}

					map.set(row.id, existing);
					return map;
				}, new Map<string, { credit: number; outstandingAmount: number }>())
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
					return sum + Math.max(0, balance.outstandingAmount - balance.credit);
				}, 0),
				unallocatedCredit: balances.reduce((sum, balance) => {
					return sum + balance.credit;
				}, 0),
			} satisfies PaymentsSummary,
		};
	});
