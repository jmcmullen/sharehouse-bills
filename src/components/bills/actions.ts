import { deleteBill, markDebtPaid } from "@/functions/bills";

export async function deleteBillAction(billId: number) {
	await deleteBill({ data: { billId } });
}

export async function markDebtPaidAction(data: {
	payments: Array<{ debtId: number; amountPaid: number }>;
}) {
	// Process all payments, including those with 0 amount (mark as unpaid)
	await Promise.all(
		data.payments.map((payment) =>
			markDebtPaid({
				data: {
					debtId: payment.debtId,
					isPaid: payment.amountPaid > 0,
				},
			}),
		),
	);
}

export async function uploadBillAction(formData: FormData) {
	const response = await fetch("/api/email-webhook", {
		method: "POST",
		body: formData,
	});

	if (!response.ok) {
		const data = await response.json();
		throw new Error(data.error || "Failed to process bill");
	}
}
