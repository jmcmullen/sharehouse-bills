import { performTrackedWhatsappDelivery } from "./whatsapp-delivery";

export async function runBillPaidNotification(notificationId: string) {
	"use workflow";

	try {
		const context = await loadBillPaidContext(notificationId);
		if (!context) {
			await markNotificationIgnored(
				notificationId,
				"bill not fully paid for WhatsApp notification",
			);
			return;
		}

		if (context.debts.length <= 1) {
			await markNotificationIgnored(
				notificationId,
				"single-debt bill; covered by individual debt paid DM",
			);
			return;
		}

		await sendBillPaidSummary(notificationId);
		await markNotificationCompleted(notificationId);
	} catch (error) {
		await markNotificationFailed(notificationId, toErrorMessage(error));
		throw error;
	}
}

async function loadBillPaidContext(notificationId: string) {
	"use step";

	const { getBillPaidNotificationContext } = await import(
		"../src/api/services/whatsapp-notifications"
	);

	return await getBillPaidNotificationContext(notificationId);
}

async function sendBillPaidSummary(notificationId: string) {
	"use step";

	const context = await requireBillPaidContext(notificationId);
	const { BillPdfStorageService } = await import(
		"../src/api/services/bill-pdf-storage"
	);
	const { getConfiguredWhatsappGroupChatId, sendWhatsappTextMessage } =
		await import("../src/api/services/waha");
	const billUrl = BillPdfStorageService.getAbsoluteViewerUrl(
		context.bill.id,
		BillPdfStorageService.getMessageCacheDate(),
	);
	if (!billUrl) {
		throw new Error("Unable to build bill URL for WhatsApp notification");
	}

	await performTrackedWhatsappDelivery({
		notificationId,
		deliveryKey: "bill_paid_summary",
		operation: "bill paid WhatsApp message",
		deliver: async () =>
			await sendWhatsappTextMessage(
				getConfiguredWhatsappGroupChatId(),
				billUrl,
			),
	});
}

sendBillPaidSummary.maxRetries = 2;

async function markNotificationCompleted(notificationId: string) {
	"use step";

	const { markWhatsappNotificationCompleted } = await import(
		"../src/api/services/whatsapp-notifications"
	);
	await markWhatsappNotificationCompleted(notificationId);
}

async function markNotificationFailed(
	notificationId: string,
	errorMessage: string,
) {
	"use step";

	const { markWhatsappNotificationFailed } = await import(
		"../src/api/services/whatsapp-notifications"
	);
	await markWhatsappNotificationFailed(notificationId, errorMessage);
}

async function markNotificationIgnored(
	notificationId: string,
	errorMessage: string,
) {
	"use step";

	const { markWhatsappNotificationIgnored } = await import(
		"../src/api/services/whatsapp-notifications"
	);
	await markWhatsappNotificationIgnored(notificationId, errorMessage);
}

async function requireBillPaidContext(notificationId: string) {
	const context = await loadBillPaidContext(notificationId);
	if (!context) {
		throw new Error(
			`Missing bill-paid notification context for notification ${notificationId}`,
		);
	}

	return context;
}

function toErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
