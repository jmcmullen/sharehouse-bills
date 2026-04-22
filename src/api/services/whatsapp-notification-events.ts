import { start } from "workflow/api";
import { runBillCreatedNotification } from "../../../workflows/bill-created";
import { runBillPaidNotification } from "../../../workflows/bill-paid";
import { runBillReminderNotification } from "../../../workflows/bill-reminder";
import { runDebtPaidNotification } from "../../../workflows/debt-paid";
import { runDueCommandNotification } from "../../../workflows/inbound-command";
import type { InboundCommandType } from "../../lib/whatsapp-commands";
import {
	createBillCreatedNotification,
	createBillPaidNotification,
	createBillReminderNotification,
	createDebtPaidNotification,
	createDueCommandNotification,
	recordWhatsappNotificationWorkflowRun,
} from "./whatsapp-notifications";

export async function enqueueBillCreatedNotification(
	billId: string,
	source: string,
) {
	const result = await createBillCreatedNotification(billId, source);
	if (result.created) {
		const run = await start(runBillCreatedNotification, [
			result.notification.id,
		]);
		await recordWhatsappNotificationWorkflowRun(
			result.notification.id,
			run.runId,
		);
	}

	return result.notification;
}

export async function enqueueBillPaidNotification(
	billId: string,
	source: string,
) {
	const result = await createBillPaidNotification(billId, source);
	if (result.created) {
		const run = await start(runBillPaidNotification, [result.notification.id]);
		await recordWhatsappNotificationWorkflowRun(
			result.notification.id,
			run.runId,
		);
	}

	return result.notification;
}

export async function enqueueDebtPaidNotification(
	debtId: string,
	source: string,
) {
	const result = await createDebtPaidNotification(debtId, source);
	if (result.created) {
		const run = await start(runDebtPaidNotification, [result.notification.id]);
		await recordWhatsappNotificationWorkflowRun(
			result.notification.id,
			run.runId,
		);
	}

	return result.notification;
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
	if (result.created) {
		const run = await start(runBillReminderNotification, [
			result.notification.id,
		]);
		await recordWhatsappNotificationWorkflowRun(
			result.notification.id,
			run.runId,
		);
	}

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
	if (result.created) {
		const run = await start(runDueCommandNotification, [
			result.notification.id,
		]);
		await recordWhatsappNotificationWorkflowRun(
			result.notification.id,
			run.runId,
		);
	}

	return result.notification;
}
