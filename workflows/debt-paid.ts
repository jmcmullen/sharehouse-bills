import { createError } from "evlog";
import { performTrackedWhatsappDelivery } from "./whatsapp-delivery";
import { emitWorkflowOutcome } from "./workflow-log";

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
		throw createError({
			message: "Unable to build receipt URL for WhatsApp notification",
			status: 500,
			why: "The debt-paid workflow could not generate an absolute public receipt URL.",
			fix: "Set VITE_BASE_URL so the workflow can build absolute public links.",
		});
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
	emitWorkflowOutcome({
		workflowName: "debt-paid",
		notificationId,
		stepName: "mark-completed",
		outcome: "completed",
		message: "debt-paid workflow completed",
	});
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
	emitWorkflowOutcome({
		workflowName: "debt-paid",
		notificationId,
		stepName: "mark-failed",
		outcome: "failed",
		message: errorMessage,
	});
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
	emitWorkflowOutcome({
		workflowName: "debt-paid",
		notificationId,
		stepName: "mark-ignored",
		outcome: "ignored",
		message: errorMessage,
	});
}

async function requireDebtPaidContext(notificationId: string) {
	const context = await loadDebtPaidContext(notificationId);
	if (!context) {
		throw createError({
			message: "Missing debt-paid notification context",
			status: 404,
			why: `No debt-paid notification context was found for notification ${notificationId}.`,
			fix: "Verify the WhatsApp notification record still exists and references a valid debt.",
		});
	}

	return context;
}

function toErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
