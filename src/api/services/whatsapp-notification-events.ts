import { start } from "workflow/api";
import { runAssistantMessageNotification } from "../../../workflows/assistant-message";
import { runBillCreatedNotification } from "../../../workflows/bill-created";
import { runBillPaidNotification } from "../../../workflows/bill-paid";
import { runBillReminderNotification } from "../../../workflows/bill-reminder";
import { runDebtPaidNotification } from "../../../workflows/debt-paid";
import { runDueCommandNotification } from "../../../workflows/inbound-command";
import { runPaymentArrivedNotification } from "../../../workflows/payment-arrived";
import { runPaymentReceiptNotification } from "../../../workflows/payment-receipt";
import { getRequestLogger } from "../../lib/request-logger";
import type { InboundCommandType } from "../../lib/whatsapp-commands";
import {
	type WhatsappNotificationRecord,
	createAssistantMessageNotification,
	createBillCreatedNotification,
	createBillReminderNotification,
	createDueCommandNotification,
	getPendingPaidNotifications,
	markWhatsappNotificationFailed,
	markWhatsappNotificationPending,
	recordWhatsappNotificationWorkflowRun,
} from "./whatsapp-notifications";

function getNotificationWorkflowRunId(
	notification: Pick<WhatsappNotificationRecord, "payload">,
) {
	const payload = notification.payload;
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		return null;
	}

	const workflowRunId = payload.workflowRunId;
	return typeof workflowRunId === "string" && workflowRunId.length > 0
		? workflowRunId
		: null;
}

function shouldStartNotificationWorkflow(
	notification: WhatsappNotificationRecord,
) {
	if (
		notification.status === "completed" ||
		notification.status === "ignored"
	) {
		return false;
	}

	return getNotificationWorkflowRunId(notification) === null;
}

function toErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

function toError(error: unknown) {
	return error instanceof Error ? error : new Error(String(error));
}

async function startNotificationWorkflow(
	notification: WhatsappNotificationRecord,
	workflowLabel: string,
	startWorkflow: () => Promise<{ runId: string }>,
) {
	if (!shouldStartNotificationWorkflow(notification)) {
		return;
	}

	if (notification.status === "failed") {
		await markWhatsappNotificationPending(notification.id);
	}

	try {
		const run = await startWorkflow();
		await recordWhatsappNotificationWorkflowRun(notification.id, run.runId);
	} catch (error) {
		const errorMessage = `Failed to enqueue ${workflowLabel}: ${toErrorMessage(error)}`;
		const actualError = toError(error);
		const log = getRequestLogger();

		log?.error(actualError, {
			whatsappNotification: {
				id: notification.id,
				eventKey: notification.eventKey,
				eventType: notification.eventType,
			},
			enqueueFailure: {
				workflowLabel,
			},
		});

		try {
			await markWhatsappNotificationFailed(notification.id, errorMessage);
		} catch (markError) {
			log?.error(toError(markError), {
				whatsappNotification: {
					id: notification.id,
					eventKey: notification.eventKey,
					eventType: notification.eventType,
				},
				enqueueFailure: {
					originalError: errorMessage,
				},
			});
		}
	}
}

export async function enqueueBillCreatedNotification(
	billId: string,
	source: string,
) {
	const result = await createBillCreatedNotification(billId, source);
	await startNotificationWorkflow(
		result.notification,
		"bill-created WhatsApp workflow",
		async () =>
			await start(runBillCreatedNotification, [result.notification.id]),
	);

	return result.notification;
}

const ledgerWorkflows: Partial<
	Record<
		WhatsappNotificationRecord["eventType"],
		{ label: string; run: (notificationId: string) => Promise<void> }
	>
> = {
	bill_paid: { label: "bill-paid", run: runBillPaidNotification },
	debt_paid: { label: "debt-paid", run: runDebtPaidNotification },
	payment_receipt: {
		label: "payment-receipt",
		run: runPaymentReceiptNotification,
	},
	payment_correction: {
		label: "payment-correction",
		run: runPaymentReceiptNotification,
	},
	payment_arrived: {
		label: "payment-arrived",
		run: runPaymentArrivedNotification,
	},
};

// Ledger transactions write notification rows directly; this hands each one
// to its workflow.
export async function startPendingPaidNotifications() {
	for (const notification of await getPendingPaidNotifications()) {
		const workflow = ledgerWorkflows[notification.eventType];
		if (!workflow) continue;
		await startNotificationWorkflow(
			notification,
			`${workflow.label} WhatsApp workflow`,
			async () => await start(workflow.run, [notification.id]),
		);
	}
}

export async function enqueueBillReminderNotification(input: {
	eventKey: string;
	billId?: string | null;
	housemateId: string;
	payload: {
		mode: "individual" | "stacked";
		kind: "pre_due" | "overdue";
		scheduledForDate: string;
		stackGroup?: string | null;
	};
}) {
	const result = await createBillReminderNotification(input);
	await startNotificationWorkflow(
		result.notification,
		"bill-reminder WhatsApp workflow",
		async () =>
			await start(runBillReminderNotification, [result.notification.id]),
	);

	return result.notification;
}

export async function enqueueDueCommandNotification(input: {
	messageId: string;
	groupChatId: string;
	senderChatId: string;
	body: string;
	sessionName: string | null;
	commandType: InboundCommandType;
	requestedFirstName: string | null;
}) {
	const result = await createDueCommandNotification(input);
	await startNotificationWorkflow(
		result.notification,
		"due-command WhatsApp workflow",
		async () =>
			await start(runDueCommandNotification, [result.notification.id]),
	);

	return result.notification;
}

export async function enqueueAssistantMessageNotification(input: {
	messageId: string;
	chatId: string;
	senderChatId: string;
	body: string;
	sessionName: string | null;
}) {
	const result = await createAssistantMessageNotification(input);
	await startNotificationWorkflow(
		result.notification,
		"assistant-message WhatsApp workflow",
		async () =>
			await start(runAssistantMessageNotification, [result.notification.id]),
	);

	return result.notification;
}
