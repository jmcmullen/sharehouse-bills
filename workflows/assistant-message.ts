import { FatalError } from "workflow";
import { performTrackedWhatsappDelivery } from "./whatsapp-delivery";
import { emitWorkflowOutcome, emitWorkflowStepEvent } from "./workflow-log";

type AssistantReply = {
	intent:
		| "tool_answer"
		| "payment_claim_redirect"
		| "unsupported"
		| "fallback_error";
	message: string;
	model: string | null;
	toolNames: string[];
	redactedPreview: string;
};

export async function runAssistantMessageNotification(notificationId: string) {
	"use workflow";

	try {
		const context = await loadAssistantMessageContext(notificationId);
		if (!context) {
			await markNotificationIgnored(
				notificationId,
				"assistant message context not found",
			);
			return;
		}

		const reply = await composeAssistantReply(notificationId);
		await sendAssistantReply(notificationId, reply);
		await markNotificationCompleted(notificationId);
	} catch (error) {
		await markNotificationFailed(notificationId, toErrorMessage(error));
		throw error;
	}
}

async function loadAssistantMessageContext(notificationId: string) {
	"use step";

	const { getAssistantMessageNotificationContext } = await import(
		"../src/api/services/whatsapp-notifications"
	);
	return await getAssistantMessageNotificationContext(notificationId);
}

async function composeAssistantReply(
	notificationId: string,
): Promise<AssistantReply> {
	"use step";

	const context = await requireAssistantMessageContext(notificationId);
	const {
		buildAssistantOtherHousemateSummary,
		buildWhatsappAssistantReply,
		findReferencedHousemate,
		referencesWholeHouse,
	} = await import("../src/api/services/whatsapp-assistant");
	const { buildUnknownHousematePaySummary } = await import(
		"../src/api/services/whatsapp-message-composer"
	);
	const { BillPdfStorageService } = await import(
		"../src/api/services/bill-pdf-storage"
	);
	const redactedPreview = context.body
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 120);

	if (!context.housemate) {
		emitWorkflowStepEvent({
			workflowName: "assistant-message",
			notificationId,
			stepName: "compose-reply",
			level: "warn",
			message: "assistant request came from an unknown WhatsApp number",
			context: {
				assistant: {
					intent: "unsupported",
					model: null,
					toolNames: [],
					messagePreview: redactedPreview,
					housemateId: null,
				},
			},
		});
		return {
			intent: "unsupported",
			message: buildUnknownHousematePaySummary(),
			model: null,
			toolNames: [],
			redactedPreview,
		};
	}

	if (
		!context.isPrivileged &&
		findReferencedHousemate({
			body: context.body,
			housemate: context.housemate,
			activeHousemates: context.activeHousemates,
		})
	) {
		emitWorkflowStepEvent({
			workflowName: "assistant-message",
			notificationId,
			stepName: "compose-reply",
			level: "warn",
			message: "assistant request targeted another housemate",
			context: {
				assistant: {
					intent: "unsupported",
					model: null,
					toolNames: [],
					messagePreview: redactedPreview,
					housemateId: context.housemate.id,
				},
			},
		});
		return {
			intent: "unsupported",
			message: buildAssistantOtherHousemateSummary(),
			model: null,
			toolNames: [],
			redactedPreview,
		};
	}

	const targetHousemate =
		context.isPrivileged && !referencesWholeHouse(context.body)
			? (findReferencedHousemate({
					body: context.body,
					housemate: context.housemate,
					activeHousemates: context.activeHousemates,
				}) ?? context.housemate)
			: context.housemate;

	const reply = await buildWhatsappAssistantReply({
		body: context.body,
		housemate: targetHousemate,
		requesterHousemate: context.housemate,
		isPrivileged: context.isPrivileged,
		previewDate: BillPdfStorageService.getMessageCacheDate(),
	});

	emitWorkflowStepEvent({
		workflowName: "assistant-message",
		notificationId,
		stepName: "compose-reply",
		level: reply.intent === "fallback_error" ? "warn" : "info",
		message: `assistant reply composed via ${reply.intent}`,
		context: {
			assistant: {
				intent: reply.intent,
				model: reply.model,
				toolNames: reply.toolNames,
				messagePreview: reply.redactedPreview,
				housemateId: targetHousemate.id,
				requesterHousemateId: context.housemate.id,
				isPrivileged: context.isPrivileged,
			},
		},
	});

	return reply;
}

composeAssistantReply.maxRetries = 1;

async function sendAssistantReply(
	notificationId: string,
	reply: AssistantReply,
) {
	"use step";

	const context = await requireAssistantMessageContext(notificationId);
	const { sendWhatsappTextMessage } = await import("../src/api/services/waha");
	const chatId = context.replyChatId;
	if (!chatId) {
		throw new FatalError(
			`Missing private reply chat for assistant notification ${notificationId}`,
		);
	}

	await performTrackedWhatsappDelivery({
		notificationId,
		deliveryKey: "assistant_message_summary",
		operation: "assistant WhatsApp message",
		deliver: async () => await sendWhatsappTextMessage(chatId, reply.message),
	});
}

sendAssistantReply.maxRetries = 2;

async function markNotificationCompleted(notificationId: string) {
	"use step";

	const { markWhatsappNotificationCompleted } = await import(
		"../src/api/services/whatsapp-notifications"
	);
	await markWhatsappNotificationCompleted(notificationId);
	emitWorkflowOutcome({
		workflowName: "assistant-message",
		notificationId,
		stepName: "mark-completed",
		outcome: "completed",
		message: "assistant-message workflow completed",
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
		workflowName: "assistant-message",
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
		workflowName: "assistant-message",
		notificationId,
		stepName: "mark-ignored",
		outcome: "ignored",
		message: errorMessage,
	});
}

async function requireAssistantMessageContext(notificationId: string) {
	const context = await loadAssistantMessageContext(notificationId);
	if (!context) {
		throw new FatalError(
			`Missing assistant message context for notification ${notificationId}`,
		);
	}

	return context;
}

function toErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
