import { FatalError } from "workflow";
import { performTrackedWhatsappDelivery } from "./whatsapp-delivery";
import { emitWorkflowOutcome } from "./workflow-log";

export async function runOverdueDigestNotification(notificationId: string) {
	"use workflow";

	try {
		const context = await loadOverdueDigestContext(notificationId);
		if (!context) {
			await markNotificationIgnored(
				notificationId,
				"housemate has no WhatsApp number; skipping overdue digest",
			);
			return;
		}

		if (!context.entry) {
			await markNotificationIgnored(
				notificationId,
				"nothing is overdue any more; skipping overdue digest",
			);
			return;
		}

		await sendOverdueDigest(notificationId);
		await markNotificationCompleted(notificationId);
	} catch (error) {
		await markNotificationFailed(notificationId, toErrorMessage(error));
		throw error;
	}
}

async function loadOverdueDigestContext(notificationId: string) {
	"use step";

	const { getOverdueDigestNotificationContext } = await import(
		"../src/api/services/overdue-digest.server"
	);
	return await getOverdueDigestNotificationContext(notificationId);
}

async function sendOverdueDigest(notificationId: string) {
	"use step";

	const context = await loadOverdueDigestContext(notificationId);
	if (!context?.entry) {
		throw new FatalError(
			`Missing overdue digest context for notification ${notificationId}`,
		);
	}
	const { BillPdfStorageService } = await import(
		"../src/api/services/bill-pdf-storage"
	);
	const { composeOverdueDigest } = await import(
		"../src/api/services/overdue-digest.server"
	);
	const { getWahaChatIdForPhoneNumber, sendWhatsappTextMessage } = await import(
		"../src/api/services/waha"
	);
	const chatId = getWahaChatIdForPhoneNumber(
		context.entry.housemate.whatsappNumber,
	);
	if (!chatId) {
		throw new FatalError(
			`Invalid WhatsApp number for housemate ${context.entry.housemate.id}`,
		);
	}
	const message = composeOverdueDigest(
		context.entry,
		BillPdfStorageService.getMessageCacheDate(),
	);
	if (!message) {
		throw new FatalError(
			`Unable to build pay URL for housemate ${context.entry.housemate.id}`,
		);
	}

	await performTrackedWhatsappDelivery({
		notificationId,
		deliveryKey: "overdue_digest",
		operation: "overdue digest WhatsApp message",
		deliver: async () => await sendWhatsappTextMessage(chatId, message),
	});
}

sendOverdueDigest.maxRetries = 2;

async function markNotificationCompleted(notificationId: string) {
	"use step";

	const { markWhatsappNotificationCompleted } = await import(
		"../src/api/services/whatsapp-notifications"
	);
	await markWhatsappNotificationCompleted(notificationId);
	emitWorkflowOutcome({
		workflowName: "overdue-digest",
		notificationId,
		stepName: "mark-completed",
		outcome: "completed",
		message: "overdue-digest workflow completed",
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
		workflowName: "overdue-digest",
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
		workflowName: "overdue-digest",
		notificationId,
		stepName: "mark-ignored",
		outcome: "ignored",
		message: errorMessage,
	});
}

function toErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
