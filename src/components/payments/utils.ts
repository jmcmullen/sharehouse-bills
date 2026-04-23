import type { PaymentListItem } from "./types";

export function formatCurrency(amount: number) {
	return new Intl.NumberFormat("en-AU", {
		style: "currency",
		currency: "AUD",
	}).format(amount);
}

export function formatDate(date: Date | string) {
	return new Date(date).toLocaleDateString("en-AU", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

export function formatDateTime(date: Date | string) {
	return new Date(date)
		.toLocaleString("en-AU", {
			day: "numeric",
			month: "short",
			year: "numeric",
			hour: "numeric",
			minute: "2-digit",
			hour12: true,
		})
		.replace("AM", "am")
		.replace("PM", "pm");
}

export function getPaymentSourceLabel(source: PaymentListItem["source"]) {
	if (source === "up_bank") {
		return "Bank Transfer";
	}

	if (source === "manual_reconciliation") {
		return "Manual Match";
	}

	return "Manual";
}

export function getPaymentSourceClassName(source: PaymentListItem["source"]) {
	if (source === "up_bank") {
		return "bg-green-100 text-green-800";
	}

	if (source === "manual_reconciliation") {
		return "bg-amber-100 text-amber-800";
	}

	return "bg-slate-100 text-slate-800";
}

export function getAppliedToLabel(payment: PaymentListItem) {
	if (payment.appliedBillNames.length === 0) {
		if (payment.creditAmount > 0.009) {
			return "Credit on account";
		}

		return "Manual adjustment";
	}

	const [firstBillName, ...otherBillNames] = payment.appliedBillNames;
	if (otherBillNames.length === 0) {
		if (payment.creditAmount > 0.009) {
			return `${firstBillName} + credit`;
		}

		return firstBillName;
	}

	const extraCount = otherBillNames.length;
	if (payment.creditAmount > 0.009) {
		return `${firstBillName} + ${extraCount} more + credit`;
	}

	return `${firstBillName} + ${extraCount} more`;
}
