import { performTrackedWhatsappDelivery } from "./whatsapp-delivery";

export async function runDebtPaidNotification(notificationId: string) {
	"use workflow";

	try {
		const context = await loadDebtPaidContext(notificationId);
		if (!context) {
			await markNotificationIgnored(
				notificationId,
				"debt not found for WhatsApp payment confirmation",
			);
			return;
		}

		if (!context.debt.isPaid) {
			await markNotificationIgnored(
				notificationId,
				"debt is not fully paid; skipping WhatsApp confirmation",
			);
			return;
		}

		const chatId = await resolveDebtPaidChatId(notificationId);
		if (!chatId) {
			await markNotificationIgnored(
				notificationId,
				"housemate has no deliverable WhatsApp number; skipping payment confirmation",
			);
			return;
		}

		await sendDebtPaidSummary(notificationId);
		await markNotificationCompleted(notificationId);
	} catch (error) {
		await markNotificationFailed(notificationId, toErrorMessage(error));
		throw error;
	}
}

async function resolveDebtPaidChatId(notificationId: string) {
	"use step";

	const context = await loadDebtPaidContext(notificationId);
	if (!context?.housemate.whatsappNumber) {
		return null;
	}
	const { getWahaChatIdForPhoneNumber } = await import(
		"../src/api/services/waha"
	);
	return getWahaChatIdForPhoneNumber(context.housemate.whatsappNumber);
}

async function loadDebtPaidContext(notificationId: string) {
	"use step";

	const { getDebtPaidNotificationContext } = await import(
		"../src/api/services/whatsapp-notifications"
	);
	return await getDebtPaidNotificationContext(notificationId);
}

async function sendDebtPaidSummary(notificationId: string) {
	"use step";

	const context = await requireDebtPaidContext(notificationId);
	const { BillPdfStorageService } = await import(
		"../src/api/services/bill-pdf-storage"
	);
	const { createAbsoluteDebtReceiptUrl } = await import(
		"../src/api/services/debt-receipt-page.server"
	);
	const { getWahaChatIdForPhoneNumber, sendWhatsappTextMessage } = await import(
		"../src/api/services/waha"
	);
	const chatId = context.housemate.whatsappNumber
		? getWahaChatIdForPhoneNumber(context.housemate.whatsappNumber)
		: null;
	if (!chatId) {
		return;
	}
	const receiptUrl = createAbsoluteDebtReceiptUrl(
		{ debtId: context.debt.id },
		BillPdfStorageService.getMessageCacheDate(),
	);
	if (!receiptUrl) {
		throw new Error("Unable to build receipt URL for WhatsApp notification");
	}

	await performTrackedWhatsappDelivery({
		notificationId,
		deliveryKey: "debt_paid_summary",
		operation: "debt paid WhatsApp message",
		deliver: async () => await sendWhatsappTextMessage(chatId, receiptUrl),
	});
}

sendDebtPaidSummary.maxRetries = 2;

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

async function requireDebtPaidContext(notificationId: string) {
	const context = await loadDebtPaidContext(notificationId);
	if (!context) {
		throw new Error(
			`Missing debt-paid notification context for notification ${notificationId}`,
		);
	}

	return context;
}

function toErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
