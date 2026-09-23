import { createError } from "evlog";
import { performTrackedWhatsappDelivery } from "./whatsapp-delivery";
import { emitWorkflowOutcome } from "./workflow-log";

export async function runPaymentArrivedNotification(notificationId: string) {
	"use workflow";

	try {
		const context = await loadPaymentArrivedContext(notificationId);
		if (!context) {
			await markNotificationIgnored(
				notificationId,
				"payment arrived context not found for WhatsApp notification",
			);
			return;
		}

		if (!context.pending) {
			await markNotificationIgnored(
				notificationId,
				"payment already reviewed; skipping arrival notice",
			);
			return;
		}

		const chatId = await resolvePaymentArrivedChatId(notificationId);
		if (!chatId) {
			await markNotificationIgnored(
				notificationId,
				"owner has no deliverable WhatsApp number; skipping arrival notice",
			);
			return;
		}

		await sendPaymentArrived(notificationId);
		await markNotificationCompleted(notificationId);
	} catch (error) {
		await markNotificationFailed(notificationId, toErrorMessage(error));
		throw error;
	}
}

async function loadPaymentArrivedContext(notificationId: string) {
	"use step";

	const { getPaymentArrivedNotificationContext } = await import(
		"../src/api/services/whatsapp-payment-arrived"
	);
	return await getPaymentArrivedNotificationContext(notificationId);
}

async function resolvePaymentArrivedChatId(notificationId: string) {
	"use step";

	const context = await loadPaymentArrivedContext(notificationId);
	if (!context?.owner.whatsappNumber) {
		return null;
	}
	const { getWahaChatIdForPhoneNumber } = await import(
		"../src/api/services/waha"
	);
	return getWahaChatIdForPhoneNumber(context.owner.whatsappNumber);
}

async function sendPaymentArrived(notificationId: string) {
	"use step";

	const context = await requirePaymentArrivedContext(notificationId);
	const { buildPaymentArrivedSummary } = await import(
		"../src/api/services/whatsapp-message-composer"
	);
	const { getWahaChatIdForPhoneNumber, sendWhatsappTextMessage } = await import(
		"../src/api/services/waha"
	);
	const chatId = context.owner.whatsappNumber
		? getWahaChatIdForPhoneNumber(context.owner.whatsappNumber)
		: null;
	if (!chatId) {
		return;
	}
	if (!context.reviewUrl) {
		throw createError({
			message: "Unable to build payment review URL for WhatsApp notification",
			status: 500,
			why: "The payment-arrived workflow could not generate an absolute review link.",
			fix: "Set VITE_BASE_URL so the workflow can build absolute app links.",
		});
	}
	const message = buildPaymentArrivedSummary({
		senderName: context.senderName,
		amountCents: context.amountCents,
		receivedAt: context.receivedAt,
		reference: context.reference,
		shared: context.shared,
		suggestion: context.suggestion,
		reviewUrl: context.reviewUrl,
	});

	await performTrackedWhatsappDelivery({
		notificationId,
		deliveryKey: "payment_arrived_summary",
		operation: "payment arrived WhatsApp message",
		deliver: async () => await sendWhatsappTextMessage(chatId, message),
	});
}

sendPaymentArrived.maxRetries = 2;

async function markNotificationCompleted(notificationId: string) {
	"use step";

	const { markWhatsappNotificationCompleted } = await import(
		"../src/api/services/whatsapp-notifications"
	);
	await markWhatsappNotificationCompleted(notificationId);
	emitWorkflowOutcome({
		workflowName: "payment-arrived",
		notificationId,
		stepName: "mark-completed",
		outcome: "completed",
		message: "payment-arrived workflow completed",
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
		workflowName: "payment-arrived",
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
		workflowName: "payment-arrived",
		notificationId,
		stepName: "mark-ignored",
		outcome: "ignored",
		message: errorMessage,
	});
}

async function requirePaymentArrivedContext(notificationId: string) {
	const context = await loadPaymentArrivedContext(notificationId);
	if (!context) {
		throw createError({
			message: "Missing payment-arrived notification context",
			status: 404,
			why: `No payment-arrived notification context was found for notification ${notificationId}.`,
			fix: "Verify the WhatsApp notification record still exists and references the owner housemate.",
		});
	}

	return context;
}

function toErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
