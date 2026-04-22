import { FatalError } from "workflow";
import { performTrackedWhatsappDelivery } from "./whatsapp-delivery";

export async function runBillReminderNotification(notificationId: string) {
	"use workflow";

	try {
		const context = await loadBillReminderContext(notificationId);
		if (!context) {
			await markNotificationIgnored(
				notificationId,
				"bill reminder context not found",
			);
			return;
		}

		if (!context.housemate.whatsappNumber) {
			await markNotificationIgnored(
				notificationId,
				"housemate has no WhatsApp number; skipping bill reminder",
			);
			return;
		}

		await sendBillReminderSummary(notificationId);
		await markNotificationCompleted(notificationId);
	} catch (error) {
		await markNotificationFailed(notificationId, toErrorMessage(error));
		throw error;
	}
}

async function loadBillReminderContext(notificationId: string) {
	"use step";

	const { getBillReminderNotificationContext } = await import(
		"../src/api/services/whatsapp-notifications"
	);
	return await getBillReminderNotificationContext(notificationId);
}

async function sendBillReminderSummary(notificationId: string) {
	"use step";

	const context = await requireBillReminderContext(notificationId);
	const { BillPdfStorageService } = await import(
		"../src/api/services/bill-pdf-storage"
	);
	const { createAbsolutePayUrl } = await import(
		"../src/api/services/housemate-pay-page"
	);
	const { getWahaChatIdForPhoneNumber, sendWhatsappTextMessage } = await import(
		"../src/api/services/waha"
	);
	const chatId = getWahaChatIdForPhoneNumber(context.housemate.whatsappNumber);

	if (!chatId) {
		throw new FatalError(
			`Invalid WhatsApp number for housemate ${context.housemate.id}`,
		);
	}

	const payUrl = (() => {
		return createAbsolutePayUrl(
			{
				housemateId: context.housemate.id,
			},
			BillPdfStorageService.getMessageCacheDate(),
		);
	})();
	if (!payUrl) {
		throw new FatalError(
			`Unable to build pay URL for housemate ${context.housemate.id}`,
		);
	}

	await performTrackedWhatsappDelivery({
		notificationId,
		deliveryKey: "bill_reminder_summary",
		operation: "bill reminder WhatsApp message",
		deliver: async () => await sendWhatsappTextMessage(chatId, payUrl),
	});
}

sendBillReminderSummary.maxRetries = 2;

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

async function requireBillReminderContext(notificationId: string) {
	const context = await loadBillReminderContext(notificationId);
	if (!context) {
		throw new FatalError(
			`Missing bill reminder context for notification ${notificationId}`,
		);
	}

	return context;
}

function toErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
