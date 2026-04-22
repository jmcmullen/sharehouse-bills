import {
	deleteBill,
	markDebtPaid,
	updateBillReminderSettings,
} from "@/functions/bills";
import { uploadBillPdf } from "@/functions/upload-bill";
import type {
	BillReminderMode,
	BillReminderOverdueCadence,
} from "@/lib/bill-reminder-config";

export async function deleteBillAction(billId: string) {
	await deleteBill({ data: { billId } });
}

export async function markDebtPaidAction(data: {
	payments: Array<{ debtId: string; amountPaid: number }>;
}) {
	await Promise.all(
		data.payments.map((payment) =>
			markDebtPaid({
				data: {
					debtId: payment.debtId,
					amountPaid: payment.amountPaid,
				},
			}),
		),
	);
}

function bytesToBase64(bytes: Uint8Array) {
	let binary = "";

	for (let index = 0; index < bytes.length; index += 0x8000) {
		const chunk = bytes.subarray(index, index + 0x8000);
		binary += String.fromCharCode(...chunk);
	}

	return btoa(binary);
}

export async function uploadBillAction(file: File) {
	const buffer = await file.arrayBuffer();

	const results = await uploadBillPdf({
		data: {
			filename: file.name,
			contentType: file.type || "application/pdf",
			size: file.size,
			dataBase64: bytesToBase64(new Uint8Array(buffer)),
		},
	});

	if (results.length === 0) {
		throw new Error("No bills were detected in the uploaded PDF");
	}

	const hasSuccessfulResult = results.some((result) => result.success);
	if (!hasSuccessfulResult) {
		throw new Error(
			results.find((result) => result.error)?.error ??
				"Failed to process uploaded bill",
		);
	}

	return results;
}

export async function updateBillReminderSettingsAction(input: {
	billId: string;
	config: {
		remindersEnabled: boolean;
		reminderMode: BillReminderMode;
		stackGroup: string | null;
		preDueOffsetsDays: number[];
		overdueCadence: BillReminderOverdueCadence;
		overdueWeekday: number | null;
	};
}) {
	await updateBillReminderSettings({
		data: input,
	});
}
