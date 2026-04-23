import { createError } from "evlog";
import { performTrackedWhatsappDelivery } from "./whatsapp-delivery";
import { emitWorkflowOutcome } from "./workflow-log";

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
	const { buildBillPaidSummary } = await import(
		"../src/api/services/whatsapp-message-composer"
	);
	const { getConfiguredWhatsappGroupChatId, sendWhatsappTextMessage } =
		await import("../src/api/services/waha");
	const billUrl = BillPdfStorageService.getAbsoluteViewerUrl(
		context.bill.id,
		BillPdfStorageService.getMessageCacheDate(),
	);
	if (!billUrl) {
		throw createError({
			message: "Unable to build bill URL for WhatsApp notification",
			status: 500,
			why: "The bill-paid workflow could not generate an absolute public bill URL.",
			fix: "Set VITE_BASE_URL so the workflow can build absolute public links.",
		});
	}

	await performTrackedWhatsappDelivery({
		notificationId,
		deliveryKey: "bill_paid_summary",
		operation: "bill paid WhatsApp message",
		deliver: async () =>
			await sendWhatsappTextMessage(
				getConfiguredWhatsappGroupChatId(),
				buildBillPaidSummary({ billUrl }),
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
	emitWorkflowOutcome({
		workflowName: "bill-paid",
		notificationId,
		stepName: "mark-completed",
		outcome: "completed",
		message: "bill-paid workflow completed",
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
		workflowName: "bill-paid",
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
		workflowName: "bill-paid",
		notificationId,
		stepName: "mark-ignored",
		outcome: "ignored",
		message: errorMessage,
	});
}

async function requireBillPaidContext(notificationId: string) {
	const context = await loadBillPaidContext(notificationId);
	if (!context) {
		throw createError({
			message: "Missing bill-paid notification context",
			status: 404,
			why: `No bill-paid notification context was found for notification ${notificationId}.`,
			fix: "Verify the WhatsApp notification record still exists and references a valid paid bill.",
		});
	}

	return context;
}

function toErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
