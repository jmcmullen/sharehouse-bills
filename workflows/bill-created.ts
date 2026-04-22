import { performTrackedWhatsappDelivery } from "./whatsapp-delivery";

export async function runBillCreatedNotification(notificationId: string) {
	"use workflow";

	try {
		const context = await loadBillCreatedContext(notificationId);
		if (!context) {
			await markNotificationIgnored(
				notificationId,
				"bill not found for WhatsApp notification",
			);
			return;
		}

		await sendBillSummary(notificationId);
		await markNotificationCompleted(notificationId);
	} catch (error) {
		await markNotificationFailed(notificationId, toErrorMessage(error));
		throw error;
	}
}

async function loadBillCreatedContext(notificationId: string) {
	"use step";

	const { getBillCreatedNotificationContext } = await import(
		"../src/api/services/whatsapp-notifications"
	);

	return await getBillCreatedNotificationContext(notificationId);
}

async function sendBillSummary(notificationId: string) {
	"use step";

	const context = await requireBillCreatedContext(notificationId);
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
		deliveryKey: "bill_summary",
		operation: "bill summary WhatsApp message",
		deliver: async () =>
			await sendWhatsappTextMessage(
				getConfiguredWhatsappGroupChatId(),
				billUrl,
			),
	});
}

sendBillSummary.maxRetries = 2;

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

async function requireBillCreatedContext(notificationId: string) {
	const context = await loadBillCreatedContext(notificationId);
	if (!context) {
		throw new Error(
			`Missing bill-created notification context for notification ${notificationId}`,
		);
	}

	return context;
}

function toErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
