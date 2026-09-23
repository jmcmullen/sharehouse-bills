import { createError } from "evlog";
import { performTrackedWhatsappDelivery } from "./whatsapp-delivery";
import { emitWorkflowOutcome } from "./workflow-log";

export async function runPaymentReceiptNotification(notificationId: string) {
	"use workflow";

	try {
		const context = await loadPaymentReceiptContext(notificationId);
		if (!context) {
			await markNotificationIgnored(
				notificationId,
				"payment receipt context not found for WhatsApp notification",
			);
			return;
		}

		const chatId = await resolvePaymentReceiptChatId(notificationId);
		if (!chatId) {
			await markNotificationIgnored(
				notificationId,
				"housemate has no deliverable WhatsApp number; skipping payment receipt",
			);
			return;
		}

		await sendPaymentReceipt(notificationId);
		await markNotificationCompleted(notificationId);
	} catch (error) {
		await markNotificationFailed(notificationId, toErrorMessage(error));
		throw error;
	}
}

async function loadPaymentReceiptContext(notificationId: string) {
	"use step";

	const { getPaymentReceiptNotificationContext } = await import(
		"../src/api/services/whatsapp-payment-receipt"
	);
	return await getPaymentReceiptNotificationContext(notificationId);
}

async function resolvePaymentReceiptChatId(notificationId: string) {
	"use step";

	const context = await loadPaymentReceiptContext(notificationId);
	if (!context?.housemate.whatsappNumber) {
		return null;
	}
	const { getWahaChatIdForPhoneNumber } = await import(
		"../src/api/services/waha"
	);
	return getWahaChatIdForPhoneNumber(context.housemate.whatsappNumber);
}

async function sendPaymentReceipt(notificationId: string) {
	"use step";

	const context = await requirePaymentReceiptContext(notificationId);
	const { buildPaymentCorrectionSummary, buildPaymentReceiptSummary } =
		await import("../src/api/services/whatsapp-message-composer");
	const { getWahaChatIdForPhoneNumber, sendWhatsappTextMessage } = await import(
		"../src/api/services/waha"
	);
	const chatId = context.housemate.whatsappNumber
		? getWahaChatIdForPhoneNumber(context.housemate.whatsappNumber)
		: null;
	if (!chatId) {
		return;
	}
	const shared = {
		firstName: context.housemate.firstName,
		amountCents: context.amountCents,
		receivedAt: context.receivedAt,
		creditCents: context.creditCents,
		balanceCents: context.balanceCents,
	};
	const message =
		context.kind === "correction"
			? buildPaymentCorrectionSummary({
					...shared,
					before: context.before,
					after: context.after,
				})
			: buildPaymentReceiptSummary({ ...shared, covered: context.after });

	await performTrackedWhatsappDelivery({
		notificationId,
		deliveryKey: "payment_receipt_summary",
		operation: "payment receipt WhatsApp message",
		deliver: async () => await sendWhatsappTextMessage(chatId, message),
	});
}

sendPaymentReceipt.maxRetries = 2;

async function markNotificationCompleted(notificationId: string) {
	"use step";

	const { markWhatsappNotificationCompleted } = await import(
		"../src/api/services/whatsapp-notifications"
	);
	await markWhatsappNotificationCompleted(notificationId);
	emitWorkflowOutcome({
		workflowName: "payment-receipt",
		notificationId,
		stepName: "mark-completed",
		outcome: "completed",
		message: "payment-receipt workflow completed",
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
		workflowName: "payment-receipt",
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
		workflowName: "payment-receipt",
		notificationId,
		stepName: "mark-ignored",
		outcome: "ignored",
		message: errorMessage,
	});
}

async function requirePaymentReceiptContext(notificationId: string) {
	const context = await loadPaymentReceiptContext(notificationId);
	if (!context) {
		throw createError({
			message: "Missing payment-receipt notification context",
			status: 404,
			why: `No payment-receipt notification context was found for notification ${notificationId}.`,
			fix: "Verify the WhatsApp notification record still exists and references a housemate.",
		});
	}

	return context;
}

function toErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
