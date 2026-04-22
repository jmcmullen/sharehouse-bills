import {
	BILL_REMINDER_WEEKDAY_OPTIONS,
	formatReminderConfigSummary,
	formatReminderOffsetsInput,
	parseReminderOffsetsInput,
} from "@/lib/bill-reminder-config";
import type { BillReminderFormData } from "./types";
import type { BillData, BillSummary, DebtSummary, GroupedBill } from "./types";

function getDebtAmountPaid(debt: NonNullable<BillData["debt"]>) {
	return debt.amountPaid || 0;
}

function getDebtAmountRemaining(debt: NonNullable<BillData["debt"]>) {
	return Math.max(0, debt.amountOwed - getDebtAmountPaid(debt));
}

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
	const totalUnpaid = unpaidDebts.reduce(
		(sum, debt) => sum + (debt ? getDebtAmountRemaining(debt) : 0),
		0,
	);
	const paidAmount = allDebts.reduce(
		(sum, debt) => sum + (debt ? getDebtAmountPaid(debt) : 0),
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
): Record<string, GroupedBill> {
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
			{} as Record<string, GroupedBill>,
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
	const paidAmount = debts.reduce((sum, item) => {
		return item.debt ? sum + getDebtAmountPaid(item.debt) : sum;
	}, 0);
	const owedAmount = debts.reduce((sum, item) => {
		return item.debt ? sum + getDebtAmountRemaining(item.debt) : sum;
	}, 0);

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

export function buildBillReminderFormData(
	bill: GroupedBill["bill"],
): BillReminderFormData {
	return {
		remindersEnabled: bill.remindersEnabled,
		reminderMode: bill.reminderMode,
		stackGroup: bill.stackGroup ?? "",
		preDueOffsetsInput: formatReminderOffsetsInput(bill.preDueOffsetsDays),
		overdueCadence: bill.overdueCadence,
		overdueWeekday:
			bill.overdueWeekday === null ? "2" : String(bill.overdueWeekday),
	};
}

export function validateBillReminderForm(formData: BillReminderFormData) {
	if (
		formData.remindersEnabled &&
		formData.reminderMode === "stacked" &&
		!formData.stackGroup.trim()
	) {
		return "Stacked reminders require a stack group";
	}

	if (
		formData.remindersEnabled &&
		formData.overdueCadence === "weekly" &&
		formData.overdueWeekday === ""
	) {
		return "Weekly reminders require a weekday";
	}

	return null;
}

export function getBillReminderFormPayload(formData: BillReminderFormData) {
	return {
		remindersEnabled: formData.remindersEnabled,
		reminderMode: formData.reminderMode,
		stackGroup: formData.stackGroup.trim() || null,
		preDueOffsetsDays:
			formData.reminderMode === "individual"
				? parseReminderOffsetsInput(formData.preDueOffsetsInput)
				: [],
		overdueCadence: formData.overdueCadence,
		overdueWeekday:
			formData.overdueCadence === "weekly"
				? Number.parseInt(formData.overdueWeekday, 10)
				: null,
	} as const;
}

export function getReminderSummaryLabel(bill: GroupedBill["bill"]) {
	return formatReminderConfigSummary({
		remindersEnabled: bill.remindersEnabled,
		reminderMode: bill.reminderMode,
		stackGroup: bill.stackGroup,
		preDueOffsetsDays: bill.preDueOffsetsDays,
		overdueCadence: bill.overdueCadence,
		overdueWeekday: bill.overdueWeekday,
	});
}

export const reminderWeekdayOptions = BILL_REMINDER_WEEKDAY_OPTIONS.map(
	(option) => ({
		value: String(option.value),
		label: option.label,
	}),
);
