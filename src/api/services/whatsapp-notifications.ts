import { and, asc, eq, lt, sql } from "drizzle-orm";
import { createError } from "evlog";
import type { BillReminderMode } from "../../lib/bill-reminder-config";
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
import { createAbsolutePayUrl } from "./housemate-pay-page.server";
import { resolveWhatsappChatIdToNumber } from "./waha";
import { whatsappNumberToChatId } from "./whatsapp-phone";

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

export type CurrentUnpaidBillSummary = {
	billId: string;
	billerName: string;
	remainingAmount: number;
	billCount: number;
	sortDate: Date;
};

export type HousematePayLinkTarget = {
	housemateId: string;
	housemateName: string;
	whatsappNumber: string | null;
	chatId: string | null;
	payUrl: string | null;
	remainingAmount: number;
};

export type HousematePayLinkBatch = {
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
		| "bill_paid"
		| "debt_paid"
		| "bill_reminder"
		| "due_command";
	billId?: string | null;
	debtId?: string | null;
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
			debtId: input.debtId ?? null,
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

export async function createBillPaidNotification(
	billId: string,
	source: string,
) {
	return await createNotification({
		eventKey: `bill-paid:${billId}`,
		eventType: "bill_paid",
		billId,
		payload: { source },
	});
}

export async function createDebtPaidNotification(
	debtId: string,
	source: string,
) {
	return await createNotification({
		eventKey: `debt-paid:${debtId}`,
		eventType: "debt_paid",
		debtId,
		payload: { source },
	});
}

export async function createBillReminderNotification(input: {
	eventKey: string;
	billId?: string | null;
	housemateId: string;
	payload: {
		mode: BillReminderMode;
		kind: "pre_due" | "overdue";
		scheduledForDate: string;
		stackGroup?: string | null;
	};
}) {
	return await createNotification({
		eventKey: input.eventKey,
		eventType: "bill_reminder",
		billId: input.billId ?? null,
		housemateId: input.housemateId,
		payload: input.payload,
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

async function getDebtPaidContextByDebtId(
	debtId: string,
	notification: WhatsappNotificationRecord | null,
) {
	const [row] = await db
		.select({
			debtId: debts.id,
			amountOwed: debts.amountOwed,
			amountPaid: debts.amountPaid,
			isPaid: debts.isPaid,
			billId: bills.id,
			billerName: bills.billerName,
			recurringTemplateName: recurringBills.templateName,
			dueDate: bills.dueDate,
			billPeriodStart: bills.billPeriodStart,
			billPeriodEnd: bills.billPeriodEnd,
			housemateId: housemates.id,
			housemateName: housemates.name,
			whatsappNumber: housemates.whatsappNumber,
		})
		.from(debts)
		.innerJoin(bills, eq(bills.id, debts.billId))
		.leftJoin(recurringBills, eq(recurringBills.id, bills.recurringBillId))
		.innerJoin(housemates, eq(housemates.id, debts.housemateId))
		.where(eq(debts.id, debtId))
		.limit(1);

	if (!row) {
		return null;
	}

	const outstandingRows = await db
		.select({
			amountOwed: debts.amountOwed,
			amountPaid: debts.amountPaid,
		})
		.from(debts)
		.where(
			and(eq(debts.housemateId, row.housemateId), eq(debts.isPaid, false)),
		);

	const remainingAmount = outstandingRows.reduce(
		(sum, debt) => sum + Math.max(0, debt.amountOwed - (debt.amountPaid ?? 0)),
		0,
	);
	const unpaidBillCount = outstandingRows.filter(
		(debt) => debt.amountOwed - (debt.amountPaid ?? 0) > 0.009,
	).length;
	const payUrl = createAbsolutePayUrl({ housemateId: row.housemateId });

	return {
		notification,
		debt: {
			id: row.debtId,
			amountOwed: row.amountOwed,
			amountPaid: row.amountPaid,
			isPaid: row.isPaid,
		},
		bill: {
			id: row.billId,
			billerName: row.billerName,
			recurringTemplateName: row.recurringTemplateName,
			dueDate: row.dueDate,
			billPeriodStart: row.billPeriodStart,
			billPeriodEnd: row.billPeriodEnd,
		},
		housemate: {
			id: row.housemateId,
			name: row.housemateName,
			whatsappNumber: row.whatsappNumber,
		},
		outstanding: {
			remainingAmount,
			unpaidBillCount,
		},
		payUrl,
	};
}

export async function getDebtPaidNotificationContext(notificationId: string) {
	const notification = await getWhatsappNotificationById(notificationId);
	if (!notification?.debtId) {
		return null;
	}

	return await getDebtPaidContextByDebtId(notification.debtId, notification);
}

export async function getRandomDebtPaidPreviewContext() {
	const [randomDebt] = await db
		.select({
			id: debts.id,
		})
		.from(debts)
		.where(eq(debts.isPaid, true))
		.orderBy(sql`random()`)
		.limit(1);

	if (!randomDebt) {
		return null;
	}

	return await getDebtPaidContextByDebtId(randomDebt.id, null);
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

function getRemainingAmount(amountOwed: number, amountPaid: number | null) {
	return Math.max(0, amountOwed - (amountPaid ?? 0));
}

export async function getCurrentUnpaidBillSummaries() {
	const rows = await db
		.select({
			billId: bills.id,
			billerName: bills.billerName,
			billType: bills.billType,
			dueDate: bills.dueDate,
			amountOwed: debts.amountOwed,
			amountPaid: debts.amountPaid,
		})
		.from(bills)
		.leftJoin(debts, eq(debts.billId, bills.id))
		.orderBy(asc(bills.dueDate), asc(bills.id), asc(debts.id));

	const billSummaries = new Map<
		string,
		CurrentUnpaidBillSummary & {
			billType: typeof bills.$inferSelect.billType;
		}
	>();

	for (const row of rows) {
		const existingSummary = billSummaries.get(row.billId);
		if (existingSummary) {
			if (row.amountOwed !== null) {
				existingSummary.remainingAmount += getRemainingAmount(
					row.amountOwed,
					row.amountPaid,
				);
			}
			continue;
		}

		billSummaries.set(row.billId, {
			billId: row.billId,
			billerName: row.billerName,
			billType: row.billType,
			remainingAmount:
				row.amountOwed !== null
					? getRemainingAmount(row.amountOwed, row.amountPaid)
					: 0,
			billCount: 1,
			sortDate: row.dueDate,
		});
	}

	const billsWithBalances = [...billSummaries.values()].filter(
		(summary) => summary.remainingAmount > 0.009,
	);
	const groupedSummaries = new Map<string, CurrentUnpaidBillSummary>();

	for (const summary of billsWithBalances) {
		const groupingKey =
			summary.billType === "electricity" || summary.billType === "gas"
				? `utility:${summary.billType}`
				: `bill:${summary.billId}`;
		const groupedLabel =
			summary.billType === "electricity"
				? "Electricity"
				: summary.billType === "gas"
					? "Gas"
					: summary.billerName;
		const existingSummary = groupedSummaries.get(groupingKey);

		if (existingSummary) {
			existingSummary.remainingAmount += summary.remainingAmount;
			existingSummary.billCount += 1;
			if (summary.sortDate < existingSummary.sortDate) {
				existingSummary.sortDate = summary.sortDate;
			}
			continue;
		}

		groupedSummaries.set(groupingKey, {
			billId: summary.billId,
			billerName: groupedLabel,
			remainingAmount: summary.remainingAmount,
			billCount: 1,
			sortDate: summary.sortDate,
		});
	}

	const groupedBills = [...groupedSummaries.values()].sort(
		(left, right) => left.sortDate.getTime() - right.sortDate.getTime(),
	);
	const totalOutstanding = billsWithBalances.reduce(
		(total, summary) => total + summary.remainingAmount,
		0,
	);

	return {
		bills: groupedBills,
		totalOutstanding,
	};
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
			amountOwed: debts.amountOwed,
			amountPaid: debts.amountPaid,
			isPaid: debts.isPaid,
		})
		.from(housemates)
		.leftJoin(debts, eq(debts.housemateId, housemates.id))
		.where(and(eq(housemates.isActive, true), eq(housemates.isOwner, false)))
		.orderBy(asc(housemates.name), asc(debts.id));

	const targets = new Map<string, HousematePayLinkTarget>();

	for (const row of rows) {
		const existingTarget = targets.get(row.housemateId);
		const target =
			existingTarget ??
			({
				housemateId: row.housemateId,
				housemateName: row.housemateName,
				whatsappNumber: row.whatsappNumber,
				chatId: whatsappNumberToChatId(row.whatsappNumber),
				payUrl: createAbsolutePayUrl(
					{ housemateId: row.housemateId },
					previewDate,
				),
				remainingAmount: 0,
			} satisfies HousematePayLinkTarget);

		if (row.amountOwed !== null && !row.isPaid) {
			target.remainingAmount += getRemainingAmount(
				row.amountOwed,
				row.amountPaid,
			);
		}

		targets.set(row.housemateId, target);
	}

	const unpaidTargets = [...targets.values()].filter(
		(target) => target.remainingAmount > 0.009,
	);

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

function getReminderNotificationPayload(
	notification: WhatsappNotificationRecord,
): {
	mode: BillReminderMode;
	kind: "pre_due" | "overdue";
	scheduledForDate: Date;
	stackGroup: string | null;
} | null {
	const payload = getNotificationPayload(notification.payload);
	const mode = payload.mode === "stacked" ? "stacked" : "individual";
	const kind = payload.kind === "overdue" ? "overdue" : "pre_due";
	const scheduledForDate =
		typeof payload.scheduledForDate === "string"
			? new Date(payload.scheduledForDate)
			: null;
	if (!scheduledForDate || Number.isNaN(scheduledForDate.getTime())) {
		return null;
	}

	return {
		mode,
		kind,
		scheduledForDate,
		stackGroup:
			typeof payload.stackGroup === "string" && payload.stackGroup.trim()
				? payload.stackGroup.trim()
				: null,
	};
}

export async function getBillReminderNotificationContext(
	notificationId: string,
) {
	const notification = await getWhatsappNotificationById(notificationId);
	if (!notification?.housemateId) {
		return null;
	}

	const payload = getReminderNotificationPayload(notification);
	if (!payload) {
		return null;
	}

	const [housemate] = await db
		.select({
			id: housemates.id,
			name: housemates.name,
			whatsappNumber: housemates.whatsappNumber,
		})
		.from(housemates)
		.where(eq(housemates.id, notification.housemateId))
		.limit(1);

	if (!housemate) {
		return null;
	}

	const dateBoundary = new Date(payload.scheduledForDate);
	if (payload.mode === "individual") {
		if (!notification.billId) {
			return null;
		}

		const [row] = await db
			.select({
				billId: bills.id,
				billerName: bills.billerName,
				recurringTemplateName: recurringBills.templateName,
				dueDate: bills.dueDate,
				amountOwed: debts.amountOwed,
				amountPaid: debts.amountPaid,
			})
			.from(debts)
			.innerJoin(bills, eq(bills.id, debts.billId))
			.leftJoin(recurringBills, eq(recurringBills.id, bills.recurringBillId))
			.where(
				and(
					eq(debts.billId, notification.billId),
					eq(debts.housemateId, housemate.id),
					eq(debts.isPaid, false),
				),
			)
			.limit(1);

		if (!row) {
			return null;
		}

		return {
			notification,
			mode: payload.mode,
			kind: payload.kind,
			housemate,
			bill: {
				id: row.billId,
				billerName: row.billerName,
				recurringTemplateName: row.recurringTemplateName,
				dueDate: row.dueDate,
			},
			debts: [
				{
					billId: row.billId,
					billerName: row.billerName,
					recurringTemplateName: row.recurringTemplateName,
					dueDate: row.dueDate,
					amountOwed: row.amountOwed,
					amountPaid: row.amountPaid,
				},
			],
			stackGroup: null,
		};
	}

	if (!payload.stackGroup) {
		return null;
	}

	const debtRows = await db
		.select({
			billId: bills.id,
			billerName: bills.billerName,
			recurringTemplateName: recurringBills.templateName,
			dueDate: bills.dueDate,
			amountOwed: debts.amountOwed,
			amountPaid: debts.amountPaid,
		})
		.from(debts)
		.innerJoin(bills, eq(bills.id, debts.billId))
		.leftJoin(recurringBills, eq(recurringBills.id, bills.recurringBillId))
		.where(
			and(
				eq(debts.housemateId, housemate.id),
				eq(debts.isPaid, false),
				eq(bills.reminderMode, "stacked"),
				eq(bills.stackGroup, payload.stackGroup),
				lt(bills.dueDate, dateBoundary),
			),
		)
		.orderBy(asc(bills.dueDate), asc(debts.id));

	if (debtRows.length === 0) {
		return null;
	}

	return {
		notification,
		mode: payload.mode,
		kind: payload.kind,
		housemate,
		bill: null,
		debts: debtRows,
		stackGroup: payload.stackGroup,
	};
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
			debts: [],
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
			debts: [],
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
			debts: [],
			inboundSenderWhatsappNumber: whatsappNumber,
			requestedFirstName,
		};
	}

	const debtRows = await db
		.select({
			billId: bills.id,
			amountOwed: debts.amountOwed,
			amountPaid: debts.amountPaid,
			billerName: bills.billerName,
			recurringTemplateName: recurringBills.templateName,
			dueDate: bills.dueDate,
			remindersEnabled: bills.remindersEnabled,
			reminderMode: bills.reminderMode,
			stackGroup: bills.stackGroup,
			preDueOffsetsDays: bills.preDueOffsetsDays,
			overdueCadence: bills.overdueCadence,
			overdueWeekday: bills.overdueWeekday,
		})
		.from(debts)
		.innerJoin(bills, eq(bills.id, debts.billId))
		.leftJoin(recurringBills, eq(recurringBills.id, bills.recurringBillId))
		.where(
			and(eq(debts.housemateId, targetHousemate.id), eq(debts.isPaid, false)),
		)
		.orderBy(asc(bills.dueDate), asc(debts.id));

	return {
		notification,
		commandType,
		replyChatId: notification.inboundSenderChatId,
		senderHousemate: senderHousemate ?? null,
		housemate: targetHousemate,
		debts: debtRows,
		inboundSenderWhatsappNumber: whatsappNumber,
		requestedFirstName,
	};
}
