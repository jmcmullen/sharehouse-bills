import { eq } from "drizzle-orm";
import { db } from "../db/index.server";
import { bills } from "../db/schema/bills";
import { debts } from "../db/schema/debts";
import { housemates } from "../db/schema/housemates";
import {
	enqueueBillPaidNotification,
	enqueueDebtPaidNotification,
} from "./whatsapp-notification-events";

export function roundCurrency(amount: number) {
	return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function getRemainingDebtAmount(debt: {
	amountOwed: number;
	amountPaid: number;
}) {
	return Math.max(0, roundCurrency(debt.amountOwed - debt.amountPaid));
}

export async function updateBillStatusFromDebts(billId: string) {
	const [existingBill] = await db
		.select({
			id: bills.id,
			status: bills.status,
		})
		.from(bills)
		.where(eq(bills.id, billId))
		.limit(1);

	if (!existingBill) {
		return null;
	}

	const billDebts = await db
		.select()
		.from(debts)
		.where(eq(debts.billId, billId));

	if (billDebts.length === 0) {
		return {
			billId,
			previousStatus: existingBill.status,
			status: existingBill.status,
			transitionedToPaid: false,
		};
	}

	const totalRemaining = billDebts.reduce((sum, debt) => {
		return sum + getRemainingDebtAmount(debt);
	}, 0);
	const totalPaidAmount = billDebts.reduce((sum, debt) => {
		return sum + roundCurrency(debt.amountPaid);
	}, 0);

	let status: "pending" | "partially_paid" | "paid" = "pending";
	if (totalRemaining <= 0.009) {
		status = "paid";
	} else if (totalPaidAmount > 0.009) {
		status = "partially_paid";
	}

	await db
		.update(bills)
		.set({
			status,
			updatedAt: new Date(),
		})
		.where(eq(bills.id, billId));

	const transitionedToPaid =
		existingBill.status !== "paid" && status === "paid";
	if (transitionedToPaid) {
		await enqueueBillPaidNotification(billId, "status_transition");
	}

	return {
		billId,
		previousStatus: existingBill.status,
		status,
		transitionedToPaid,
	};
}

export async function applyHousemateCreditToDebt(
	housemateId: string,
	debtId: string,
) {
	const [housemate] = await db
		.select({
			creditBalance: housemates.creditBalance,
		})
		.from(housemates)
		.where(eq(housemates.id, housemateId))
		.limit(1);

	if (!housemate || housemate.creditBalance <= 0.009) {
		return 0;
	}

	const [debt] = await db
		.select({
			id: debts.id,
			billId: debts.billId,
			housemateId: debts.housemateId,
			amountOwed: debts.amountOwed,
			amountPaid: debts.amountPaid,
		})
		.from(debts)
		.where(eq(debts.id, debtId))
		.limit(1);

	if (!debt || debt.housemateId !== housemateId) {
		return 0;
	}

	const remainingAmount = getRemainingDebtAmount(debt);
	if (remainingAmount <= 0.009) {
		return 0;
	}

	const appliedAmount = Math.min(housemate.creditBalance, remainingAmount);
	const nextAmountPaid = roundCurrency(debt.amountPaid + appliedAmount);
	const fullyPaid =
		getRemainingDebtAmount({
			amountOwed: debt.amountOwed,
			amountPaid: nextAmountPaid,
		}) <= 0.009;
	const now = new Date();

	await db
		.update(debts)
		.set({
			amountPaid: fullyPaid ? debt.amountOwed : nextAmountPaid,
			isPaid: fullyPaid,
			paidAt: fullyPaid ? now : null,
			updatedAt: now,
		})
		.where(eq(debts.id, debt.id));

	await db
		.update(housemates)
		.set({
			creditBalance: roundCurrency(housemate.creditBalance - appliedAmount),
			updatedAt: now,
		})
		.where(eq(housemates.id, housemateId));

	await updateBillStatusFromDebts(debt.billId);
	if (fullyPaid) {
		await enqueueDebtPaidNotification(debt.id, "credit");
	}

	return roundCurrency(appliedAmount);
}
