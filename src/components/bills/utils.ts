import type { BillData, BillSummary, DebtSummary, GroupedBill } from "./types";

export function calculateSummary(billsData: BillData[]): BillSummary {
	if (!billsData || billsData.length === 0) {
		return {
			totalBills: 0,
			totalAmount: 0,
			totalUnpaid: 0,
			unpaidCount: 0,
			paidAmount: 0,
			outstandingAmount: 0,
		};
	}

	const billsMap = new Map();
	const allDebts: BillData["debt"][] = [];

	for (const row of billsData) {
		if (!billsMap.has(row.bill.id)) {
			billsMap.set(row.bill.id, row.bill);
		}
		if (row.debt) {
			allDebts.push(row.debt);
		}
	}

	const totalBills = billsMap.size;
	const totalAmount = Array.from(billsMap.values()).reduce(
		(sum, bill) => sum + bill.totalAmount,
		0,
	);

	const unpaidDebts = allDebts.filter((debt) => !debt?.isPaid);
	const paidDebts = allDebts.filter((debt) => debt?.isPaid);

	const totalUnpaid = unpaidDebts.reduce(
		(sum, debt) => sum + (debt?.amountOwed || 0),
		0,
	);
	const paidAmount = paidDebts.reduce(
		(sum, debt) => sum + (debt?.amountOwed || 0),
		0,
	);

	return {
		totalBills,
		totalAmount,
		totalUnpaid,
		unpaidCount: unpaidDebts.length,
		paidAmount,
		outstandingAmount: totalUnpaid,
	};
}

export function groupBillsByBillId(
	billsData: BillData[],
): Record<number, GroupedBill> {
	return (
		billsData?.reduce(
			(acc, row) => {
				const billId = row.bill.id;
				if (!acc[billId]) {
					acc[billId] = {
						bill: row.bill,
						debts: [],
					};
				}
				if (row.debt && row.housemate) {
					acc[billId].debts.push({
						debt: row.debt,
						housemate: row.housemate,
					});
				}
				return acc;
			},
			{} as Record<number, GroupedBill>,
		) || {}
	);
}

export function getAmountPerPerson(debts: GroupedBill["debts"]): number {
	if (!debts || debts.length === 0) return 0;
	return debts[0]?.debt?.amountOwed || 0;
}

export function getDebtSummary(debts: GroupedBill["debts"]): DebtSummary {
	const paid = debts.filter((d) => d.debt?.isPaid).length;
	const total = debts.length;
	const paidAmount = debts
		.filter((d) => d.debt?.isPaid)
		.reduce((sum, d) => sum + (d.debt?.amountOwed || 0), 0);
	const owedAmount = debts
		.filter((d) => !d.debt?.isPaid)
		.reduce((sum, d) => sum + (d.debt?.amountOwed || 0), 0);

	return { paid, total, paidAmount, owedAmount, debts };
}

export function formatCurrency(amount: number): string {
	return new Intl.NumberFormat("en-AU", {
		style: "currency",
		currency: "AUD",
	}).format(amount);
}

export function formatDate(date: Date | string): string {
	return new Date(date).toLocaleDateString("en-AU", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

export const PAGINATION_CONFIG = {
	itemsPerPage: 10,
} as const;
