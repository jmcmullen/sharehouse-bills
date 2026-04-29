import { createError } from "evlog";
import { performTrackedWhatsappDelivery } from "./whatsapp-delivery";
import { emitWorkflowOutcome } from "./workflow-log";

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
		throw createError({
			message: "Unable to build bill URL for WhatsApp notification",
			status: 500,
			why: "The bill-created workflow could not generate an absolute public bill URL.",
			fix: "Set VITE_BASE_URL so the workflow can build absolute public links.",
		});
	}
	await assertBillPreviewReady(billUrl);

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

async function assertBillPreviewReady(billUrl: string) {
	const response = await fetch(billUrl, {
		headers: {
			"User-Agent": "WhatsApp/2.24.0",
		},
	});
	if (!response.ok) {
		throw createError({
			message: "Bill preview page is not ready",
			status: 502,
			why: `The public bill page returned ${response.status} before WhatsApp delivery.`,
			fix: "Retry the workflow after the public bill page is reachable.",
		});
	}

	const html = await response.text();
	const ogImageUrl = getMetaContent(html, "og:image");
	if (!getMetaContent(html, "og:title") || !ogImageUrl) {
		throw createError({
			message: "Bill preview metadata is not ready",
			status: 502,
			why: "The public bill page was reachable but did not include the expected Open Graph title and image metadata.",
			fix: "Retry the workflow after the public bill page renders bill metadata.",
		});
	}

	const imageResponse = await fetch(new URL(ogImageUrl, billUrl), {
		headers: {
			"User-Agent": "WhatsApp/2.24.0",
		},
	});
	if (
		!imageResponse.ok ||
		!imageResponse.headers.get("content-type")?.startsWith("image/")
	) {
		throw createError({
			message: "Bill preview image is not ready",
			status: 502,
			why: `The public bill card image returned ${imageResponse.status} with content type ${imageResponse.headers.get("content-type") ?? "unknown"}.`,
			fix: "Retry the workflow after the public bill card image is reachable.",
		});
	}
	await imageResponse.arrayBuffer();
}

function getMetaContent(html: string, property: string) {
	const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = html.match(
		new RegExp(
			`<meta[^>]+(?:property|name)=["']${escapedProperty}["'][^>]+content=["']([^"']+)["'][^>]*>`,
			"i",
		),
	);

	return match?.[1] ?? null;
}

async function markNotificationCompleted(notificationId: string) {
	"use step";

	const { markWhatsappNotificationCompleted } = await import(
		"../src/api/services/whatsapp-notifications"
	);
	await markWhatsappNotificationCompleted(notificationId);
	emitWorkflowOutcome({
		workflowName: "bill-created",
		notificationId,
		stepName: "mark-completed",
		outcome: "completed",
		message: "bill-created workflow completed",
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
		workflowName: "bill-created",
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
		workflowName: "bill-created",
		notificationId,
		stepName: "mark-ignored",
		outcome: "ignored",
		message: errorMessage,
	});
}

async function requireBillCreatedContext(notificationId: string) {
	const context = await loadBillCreatedContext(notificationId);
	if (!context) {
		throw createError({
			message: "Missing bill-created notification context",
			status: 404,
			why: `No bill-created notification context was found for notification ${notificationId}.`,
			fix: "Verify the WhatsApp notification record still exists and references a valid bill.",
		});
	}

	return context;
}

function toErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
