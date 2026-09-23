import { roundCurrency } from "../../lib/equal-split";

export function getRemainingDebtAmount(debt: {
	amountOwed: number;
	amountPaid: number;
}) {
	return Math.max(0, roundCurrency(debt.amountOwed - debt.amountPaid));
}
