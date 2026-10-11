// fallow-ignore-file code-duplication
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { createError } from "evlog";
import {
	type InboundCommandType,
	parseStoredInboundCommandType,
} from "../../lib/whatsapp-commands";
import { db } from "../db/index.server";
import { bills } from "../db/schema/bills";
import { debts } from "../db/schema/debts";
import { housemates } from "../db/schema/housemates";
import { recurringBills } from "../db/schema/recurring-bills";
import { whatsappNotifications } from "../db/schema/whatsapp-notifications";
import { createAbsolutePayUrl } from "./pay-token.server";
import { getCoveredShares } from "./unpaid-shares.server";
import { summarizeUnpaidBills, toPayCents } from "./unpaid-totals";
import { getWhatsappAdminChatId } from "./waha";
import { resolveWhatsappChatIdToNumber } from "./waha";
import {
	whatsappChatIdToNumber,
	whatsappNumberToChatId,
} from "./whatsapp-phone";

export type WhatsappNotificationRecord =
	typeof whatsappNotifications.$inferSelect;

type WhatsappNotificationPayload = Record<string, unknown> & {
	workflowRunId?: string;
	deliveries?: Record<string, WhatsappNotificationDeliveryPayload>;
};

type WhatsappNotificationDeliveryPayload = {
	stepId: string;
	status: "sending" | "sent" | "retryable";
	attemptCount: number;
	startedAt: string;
	sentAt?: string | null;
	messageId?: string | null;
	lastError?: string | null;
};

type NotificationCreateResult = {
	created: boolean;
	notification: WhatsappNotificationRecord;
};

type DeliveryReservationResult =
	| {
			outcome: "reserved";
			delivery: WhatsappNotificationDeliveryPayload;
	  }
	| {
			outcome: "already_sent" | "indeterminate";
			delivery: WhatsappNotificationDeliveryPayload;
	  };

type HousematePayLinkTarget = {
	housemateId: string;
	housemateName: string;
	whatsappNumber: string | null;
	chatId: string | null;
	payUrl: string | null;
	remainingAmount: number;
};

type HousematePayLinkBatch = {
	deliverableTargets: HousematePayLinkTarget[];
	skippedTargets: Array<
		HousematePayLinkTarget & {
			reason: "missing_whatsapp_number" | "missing_pay_url";
		}
	>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function chatIdsMatch(left: string, right: string) {
	if (left === right) {
		return true;
	}

	const leftNumber = whatsappChatIdToNumber(left);
	const rightNumber = whatsappChatIdToNumber(right);

	return leftNumber !== null && leftNumber === rightNumber;
}

function getNotificationPayload(
	payload: WhatsappNotificationRecord["payload"],
): WhatsappNotificationPayload {
	return isRecord(payload) ? { ...payload } : {};
}

function getNotificationDeliveries(payload: WhatsappNotificationPayload) {
	return isRecord(payload.deliveries)
		? { ...payload.deliveries }
		: ({} satisfies Record<string, WhatsappNotificationDeliveryPayload>);
}

function getDeliveryPayload(
	value: unknown,
): WhatsappNotificationDeliveryPayload | null {
	if (!isRecord(value) || typeof value.stepId !== "string") {
		return null;
	}

	const status = value.status;
	if (status !== "sending" && status !== "sent" && status !== "retryable") {
		return null;
	}

	return {
		stepId: value.stepId,
		status,
		attemptCount:
			typeof value.attemptCount === "number" &&
			Number.isFinite(value.attemptCount)
				? value.attemptCount
				: 0,
		startedAt:
			typeof value.startedAt === "string"
				? value.startedAt
				: new Date(0).toISOString(),
		sentAt: typeof value.sentAt === "string" ? value.sentAt : null,
		messageId: typeof value.messageId === "string" ? value.messageId : null,
		lastError: typeof value.lastError === "string" ? value.lastError : null,
	};
}

async function updateNotificationPayload(
	notificationId: string,
	updater: (
		payload: WhatsappNotificationPayload,
	) => WhatsappNotificationPayload,
) {
	const notification = await getWhatsappNotificationById(notificationId);
	if (!notification) {
		throw createError({
			message: "WhatsApp notification not found",
			status: 404,
			why: `WhatsApp notification ${notificationId} was not found while updating notification payload.`,
			fix: "Verify the notification record still exists before retrying the workflow update.",
		});
	}

	const payload = updater(getNotificationPayload(notification.payload));

	await db
		.update(whatsappNotifications)
		.set({
			payload,
			updatedAt: new Date(),
		})
		.where(eq(whatsappNotifications.id, notificationId));
}

async function createNotification(input: {
	eventKey: string;
	eventType:
		| "bill_created"
		| "overdue_digest"
		| "due_command"
		| "assistant_message";
	billId?: string | null;
	housemateId?: string | null;
	inboundMessageId?: string | null;
	inboundChatId?: string | null;
	inboundSenderChatId?: string | null;
	payload?: Record<string, unknown> | null;
}) {
	const now = new Date();
	const insertedRows = await db
		.insert(whatsappNotifications)
		.values({
			eventKey: input.eventKey,
			eventType: input.eventType,
			billId: input.billId ?? null,
			housemateId: input.housemateId ?? null,
			inboundMessageId: input.inboundMessageId ?? null,
			inboundChatId: input.inboundChatId ?? null,
			inboundSenderChatId: input.inboundSenderChatId ?? null,
			payload: input.payload ?? null,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing({
			target: whatsappNotifications.eventKey,
		})
		.returning();

	const [notification] = insertedRows.length
		? insertedRows
		: await db
				.select()
				.from(whatsappNotifications)
				.where(eq(whatsappNotifications.eventKey, input.eventKey))
				.limit(1);

	if (!notification) {
		throw createError({
			message: "Failed to load WhatsApp notification after create",
			status: 500,
			why: `No WhatsApp notification row could be loaded for event key ${input.eventKey} after insert/conflict handling.`,
			fix: "Inspect the whatsappNotifications table and unique event key handling before retrying notification creation.",
		});
	}

	return {
		created: insertedRows.length > 0,
		notification,
	} satisfies NotificationCreateResult;
}

export async function createBillCreatedNotification(
	billId: string,
	source: string,
) {
	return await createNotification({
		eventKey: `bill-created:${billId}`,
		eventType: "bill_created",
		billId,
		payload: { source },
	});
}

export async function createOverdueDigestNotification(input: {
	eventKey: string;
	housemateId: string;
	date: string;
}) {
	return await createNotification({
		eventKey: input.eventKey,
		eventType: "overdue_digest",
		housemateId: input.housemateId,
		payload: { date: input.date },
	});
}

export async function createDueCommandNotification(input: {
	messageId: string;
	groupChatId: string;
	senderChatId: string;
	body: string;
	sessionName: string | null;
	commandType: InboundCommandType;
	requestedFirstName: string | null;
}) {
	return await createNotification({
		eventKey: `due-command:${input.messageId}`,
		eventType: "due_command",
		inboundMessageId: input.messageId,
		inboundChatId: input.groupChatId,
		inboundSenderChatId: input.senderChatId,
		payload: {
			body: input.body,
			sessionName: input.sessionName,
			commandType: input.commandType,
			requestedFirstName: input.requestedFirstName,
		},
	});
}

export async function createAssistantMessageNotification(input: {
	messageId: string;
	chatId: string;
	senderChatId: string;
	body: string;
	sessionName: string | null;
}) {
	return await createNotification({
		eventKey: `assistant-message:${input.messageId}`,
		eventType: "assistant_message",
		inboundMessageId: input.messageId,
		inboundChatId: input.chatId,
		inboundSenderChatId: input.senderChatId,
		payload: {
			body: input.body,
			sessionName: input.sessionName,
		},
	});
}

// Paid and receipt notifications the ledger recorded inside its own
// transaction and that no workflow has picked up yet.
export async function getPendingPaidNotifications() {
	return await db
		.select()
		.from(whatsappNotifications)
		.where(
			and(
				eq(whatsappNotifications.status, "pending"),
				inArray(whatsappNotifications.eventType, [
					"bill_paid",
					"payment_receipt",
					"payment_correction",
					"payment_arrived",
				]),
				sql`json_extract(${whatsappNotifications.payload}, '$.workflowRunId') IS NULL`,
			),
		)
		.orderBy(asc(whatsappNotifications.createdAt));
}

export async function getWhatsappNotificationById(notificationId: string) {
	const [notification] = await db
		.select()
		.from(whatsappNotifications)
		.where(eq(whatsappNotifications.id, notificationId))
		.limit(1);

	return notification ?? null;
}

export async function markWhatsappNotificationCompleted(
	notificationId: string,
) {
	await db
		.update(whatsappNotifications)
		.set({
			status: "completed",
			errorMessage: null,
			completedAt: new Date(),
			updatedAt: new Date(),
		})
		.where(eq(whatsappNotifications.id, notificationId));
}

export async function markWhatsappNotificationFailed(
	notificationId: string,
	errorMessage: string,
) {
	await db
		.update(whatsappNotifications)
		.set({
			status: "failed",
			errorMessage,
			updatedAt: new Date(),
		})
		.where(eq(whatsappNotifications.id, notificationId));
}

export async function markWhatsappNotificationPending(notificationId: string) {
	await db
		.update(whatsappNotifications)
		.set({
			status: "pending",
			errorMessage: null,
			completedAt: null,
			updatedAt: new Date(),
		})
		.where(eq(whatsappNotifications.id, notificationId));
}

export async function markWhatsappNotificationIgnored(
	notificationId: string,
	errorMessage: string,
) {
	await db
		.update(whatsappNotifications)
		.set({
			status: "ignored",
			errorMessage,
			completedAt: new Date(),
			updatedAt: new Date(),
		})
		.where(eq(whatsappNotifications.id, notificationId));
}

export async function recordWhatsappNotificationWorkflowRun(
	notificationId: string,
	workflowRunId: string,
) {
	await updateNotificationPayload(notificationId, (payload) => ({
		...payload,
		workflowRunId,
	}));
}

export async function reserveWhatsappNotificationDelivery(
	notificationId: string,
	deliveryKey: string,
	stepId: string,
): Promise<DeliveryReservationResult> {
	const notification = await getWhatsappNotificationById(notificationId);
	if (!notification) {
		throw createError({
			message: "WhatsApp notification not found",
			status: 404,
			why: `WhatsApp notification ${notificationId} was not found while reserving delivery ${deliveryKey}.`,
			fix: "Verify the notification record still exists before retrying delivery reservation.",
		});
	}

	const payload = getNotificationPayload(notification.payload);
	const deliveries = getNotificationDeliveries(payload);
	const existingDelivery = getDeliveryPayload(deliveries[deliveryKey]);

	if (existingDelivery?.status === "sent") {
		return {
			outcome: "already_sent",
			delivery: existingDelivery,
		};
	}

	if (existingDelivery?.status === "sending") {
		return {
			outcome: "indeterminate",
			delivery: existingDelivery,
		};
	}

	const nextDelivery: WhatsappNotificationDeliveryPayload = {
		stepId,
		status: "sending",
		attemptCount: (existingDelivery?.attemptCount ?? 0) + 1,
		startedAt: new Date().toISOString(),
		sentAt: null,
		messageId: existingDelivery?.messageId ?? null,
		lastError: null,
	};

	deliveries[deliveryKey] = nextDelivery;

	await db
		.update(whatsappNotifications)
		.set({
			payload: {
				...payload,
				deliveries,
			},
			updatedAt: new Date(),
		})
		.where(eq(whatsappNotifications.id, notificationId));

	return {
		outcome: "reserved",
		delivery: nextDelivery,
	};
}

export async function markWhatsappNotificationDeliverySent(input: {
	notificationId: string;
	deliveryKey: string;
	stepId: string;
	messageId?: string | null;
}) {
	await updateNotificationPayload(input.notificationId, (payload) => {
		const deliveries = getNotificationDeliveries(payload);
		const existingDelivery = getDeliveryPayload(deliveries[input.deliveryKey]);

		deliveries[input.deliveryKey] = {
			stepId: input.stepId,
			status: "sent",
			attemptCount: existingDelivery?.attemptCount ?? 1,
			startedAt: existingDelivery?.startedAt ?? new Date().toISOString(),
			sentAt: new Date().toISOString(),
			messageId: input.messageId ?? null,
			lastError: null,
		};

		return {
			...payload,
			deliveries,
		};
	});
}

export async function markWhatsappNotificationDeliveryRetryable(input: {
	notificationId: string;
	deliveryKey: string;
	stepId: string;
	errorMessage: string;
}) {
	await updateNotificationPayload(input.notificationId, (payload) => {
		const deliveries = getNotificationDeliveries(payload);
		const existingDelivery = getDeliveryPayload(deliveries[input.deliveryKey]);

		deliveries[input.deliveryKey] = {
			stepId: input.stepId,
			status: "retryable",
			attemptCount: existingDelivery?.attemptCount ?? 1,
			startedAt: existingDelivery?.startedAt ?? new Date().toISOString(),
			sentAt: existingDelivery?.sentAt ?? null,
			messageId: existingDelivery?.messageId ?? null,
			lastError: input.errorMessage,
		};

		return {
			...payload,
			deliveries,
		};
	});
}

export async function getBillCreatedNotificationContext(
	notificationId: string,
) {
	const notification = await getWhatsappNotificationById(notificationId);
	if (!notification?.billId) {
		return null;
	}

	return await getBillSummaryContextByBillId(notification.billId, notification);
}

export async function getBillPaidNotificationContext(notificationId: string) {
	const notification = await getWhatsappNotificationById(notificationId);
	if (!notification?.billId) {
		return null;
	}

	const context = await getBillSummaryContextByBillId(
		notification.billId,
		notification,
	);
	if (!context || context.bill.status !== "paid") {
		return null;
	}

	return context;
}

async function getBillSummaryContextByBillId(
	billId: string,
	notification: WhatsappNotificationRecord | null,
) {
	const rows = await db
		.select({
			billId: bills.id,
			billerName: bills.billerName,
			totalAmount: bills.totalAmount,
			status: bills.status,
			dueDate: bills.dueDate,
			billPeriodStart: bills.billPeriodStart,
			billPeriodEnd: bills.billPeriodEnd,
			pdfSha256: bills.pdfSha256,
			pdfUrl: bills.pdfUrl,
			sourceFilename: bills.sourceFilename,
			recurringTemplateName: recurringBills.templateName,
			debtId: debts.id,
			amountOwed: debts.amountOwed,
			amountPaid: debts.amountPaid,
			housemateId: housemates.id,
			housemateName: housemates.name,
			whatsappNumber: housemates.whatsappNumber,
		})
		.from(bills)
		.leftJoin(debts, eq(debts.billId, bills.id))
		.leftJoin(housemates, eq(housemates.id, debts.housemateId))
		.leftJoin(recurringBills, eq(recurringBills.id, bills.recurringBillId))
		.where(eq(bills.id, billId))
		.orderBy(asc(debts.id));

	if (rows.length === 0) {
		return null;
	}

	return {
		notification,
		bill: {
			id: rows[0].billId,
			billerName: rows[0].billerName,
			totalAmount: rows[0].totalAmount,
			status: rows[0].status,
			dueDate: rows[0].dueDate,
			billPeriodStart: rows[0].billPeriodStart,
			billPeriodEnd: rows[0].billPeriodEnd,
			pdfSha256: rows[0].pdfSha256,
			pdfUrl: rows[0].pdfUrl,
			sourceFilename: rows[0].sourceFilename,
			recurringTemplateName: rows[0].recurringTemplateName,
		},
		debts: rows
			.filter((row) => row.debtId !== null && row.housemateId !== null)
			.map((row) => ({
				id: row.debtId as string,
				amountOwed: row.amountOwed as number,
				amountPaid: (row.amountPaid as number) ?? 0,
				housemateId: row.housemateId as string,
				housemateName: row.housemateName as string,
				whatsappNumber: row.whatsappNumber,
			})),
	};
}

export async function getRandomBillPreviewContext() {
	const [randomBill] = await db
		.select({
			id: bills.id,
		})
		.from(bills)
		.orderBy(sql`random()`)
		.limit(1);

	if (!randomBill) {
		return null;
	}

	return await getBillSummaryContextByBillId(randomBill.id, null);
}

export async function getRandomBillPaidPreviewContext() {
	const [randomBill] = await db
		.select({
			id: bills.id,
		})
		.from(bills)
		.innerJoin(debts, eq(debts.billId, bills.id))
		.where(eq(bills.status, "paid"))
		.groupBy(bills.id)
		.having(sql`count(${debts.id}) > 1`)
		.orderBy(sql`random()`)
		.limit(1);

	if (!randomBill) {
		return null;
	}

	return await getBillSummaryContextByBillId(randomBill.id, null);
}

// Bills still unpaid across the house, after each housemate's held credit
// covers their oldest shares.
export async function getCurrentUnpaidBillSummaries() {
	const rows = await db
		.selectDistinct({ housemateId: debts.housemateId })
		.from(debts)
		.where(eq(debts.isPaid, false));
	const covered = await Promise.all(
		rows.map((row) => getCoveredShares(row.housemateId)),
	);
	return summarizeUnpaidBills(covered.flatMap((entry) => entry.shares));
}

export async function getActiveHousematePaymentNames() {
	const activeHousemates = await db
		.select({
			name: housemates.name,
		})
		.from(housemates)
		.where(and(eq(housemates.isActive, true), eq(housemates.isOwner, false)))
		.orderBy(asc(housemates.name));

	return activeHousemates.map((housemate) => housemate.name);
}

export async function getHousematePayLinkBatch(previewDate?: string | null) {
	const rows = await db
		.select({
			housemateId: housemates.id,
			housemateName: housemates.name,
			whatsappNumber: housemates.whatsappNumber,
		})
		.from(housemates)
		.where(and(eq(housemates.isActive, true), eq(housemates.isOwner, false)))
		.orderBy(asc(housemates.name));
	const targets = await Promise.all(
		rows.map(async (row) => {
			const { shares } = await getCoveredShares(row.housemateId);
			return {
				...row,
				chatId: whatsappNumberToChatId(row.whatsappNumber),
				payUrl: createAbsolutePayUrl(
					{ housemateId: row.housemateId },
					previewDate,
				),
				remainingAmount: toPayCents(shares) / 100,
			} satisfies HousematePayLinkTarget;
		}),
	);
	const unpaidTargets = targets.filter((target) => target.remainingAmount > 0);

	return unpaidTargets.reduce<HousematePayLinkBatch>(
		(result, target) => {
			if (!target.whatsappNumber || !target.chatId) {
				result.skippedTargets.push({
					...target,
					reason: "missing_whatsapp_number",
				});
				return result;
			}

			if (!target.payUrl) {
				result.skippedTargets.push({
					...target,
					reason: "missing_pay_url",
				});
				return result;
			}

			result.deliverableTargets.push(target);
			return result;
		},
		{
			deliverableTargets: [],
			skippedTargets: [],
		},
	);
}

export async function getDueCommandNotificationContext(notificationId: string) {
	const notification = await getWhatsappNotificationById(notificationId);
	if (!notification?.inboundSenderChatId || !notification.inboundMessageId) {
		return null;
	}

	const whatsappNumber = await resolveWhatsappChatIdToNumber(
		notification.inboundSenderChatId,
	);
	const requestedFirstName =
		typeof notification.payload?.requestedFirstName === "string"
			? notification.payload.requestedFirstName.trim()
			: null;
	const commandType = parseStoredInboundCommandType(
		notification.payload?.commandType,
	);

	const [senderHousemate] = whatsappNumber
		? await db
				.select({
					id: housemates.id,
					name: housemates.name,
					whatsappNumber: housemates.whatsappNumber,
				})
				.from(housemates)
				.where(eq(housemates.whatsappNumber, whatsappNumber))
				.limit(1)
		: [];

	const activeHousemates = await db
		.select({
			id: housemates.id,
			name: housemates.name,
			whatsappNumber: housemates.whatsappNumber,
		})
		.from(housemates)
		.where(eq(housemates.isActive, true));

	const requestedHousemate = requestedFirstName
		? (activeHousemates.find((housemate) => {
				const firstName = housemate.name.trim().split(/\s+/)[0]?.toLowerCase();
				return firstName === requestedFirstName.toLowerCase();
			}) ?? null)
		: null;

	if (commandType === "pay") {
		return {
			notification,
			commandType,
			replyChatId: notification.inboundSenderChatId,
			senderHousemate: senderHousemate ?? null,
			housemate: senderHousemate ?? null,
			inboundSenderWhatsappNumber: whatsappNumber,
			requestedFirstName: null,
		};
	}

	if (commandType !== "due") {
		return {
			notification,
			commandType,
			replyChatId: notification.inboundSenderChatId,
			senderHousemate: senderHousemate ?? null,
			housemate: null,
			inboundSenderWhatsappNumber: whatsappNumber,
			requestedFirstName: null,
		};
	}

	const targetHousemate = requestedHousemate ?? senderHousemate ?? null;

	if (!targetHousemate) {
		return {
			notification,
			commandType,
			replyChatId: notification.inboundSenderChatId,
			senderHousemate: senderHousemate ?? null,
			housemate: null,
			inboundSenderWhatsappNumber: whatsappNumber,
			requestedFirstName,
		};
	}

	return {
		notification,
		commandType,
		replyChatId: notification.inboundSenderChatId,
		senderHousemate: senderHousemate ?? null,
		housemate: targetHousemate,
		inboundSenderWhatsappNumber: whatsappNumber,
		requestedFirstName,
	};
}

export async function getAssistantMessageNotificationContext(
	notificationId: string,
) {
	const notification = await getWhatsappNotificationById(notificationId);
	if (!notification?.inboundChatId || !notification.inboundSenderChatId) {
		return null;
	}

	const body =
		typeof notification.payload?.body === "string"
			? notification.payload.body
			: null;
	if (!body) {
		return null;
	}

	const whatsappNumber = await resolveWhatsappChatIdToNumber(
		notification.inboundSenderChatId,
	);
	const adminChatId = getWhatsappAdminChatId();
	const [senderHousemate] = whatsappNumber
		? await db
				.select({
					id: housemates.id,
					name: housemates.name,
					whatsappNumber: housemates.whatsappNumber,
					isOwner: housemates.isOwner,
				})
				.from(housemates)
				.where(eq(housemates.whatsappNumber, whatsappNumber))
				.limit(1)
		: [];

	const activeHousemates = await db
		.select({
			id: housemates.id,
			name: housemates.name,
			isOwner: housemates.isOwner,
		})
		.from(housemates)
		.where(eq(housemates.isActive, true));

	return {
		notification,
		replyChatId: notification.inboundChatId,
		body,
		inboundSenderWhatsappNumber: whatsappNumber,
		housemate: senderHousemate ?? null,
		isPrivileged:
			(senderHousemate?.isOwner ?? false) ||
			(adminChatId
				? chatIdsMatch(notification.inboundSenderChatId, adminChatId)
				: false),
		activeHousemates,
	};
}
