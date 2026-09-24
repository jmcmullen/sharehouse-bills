import { FatalError } from "workflow";
import type { InboundCommandType } from "../src/lib/whatsapp-commands";
import { performTrackedWhatsappDelivery } from "./whatsapp-delivery";
import { emitWorkflowOutcome } from "./workflow-log";

export async function runDueCommandNotification(notificationId: string) {
	"use workflow";

	try {
		const context = await loadDueCommandContext(notificationId);
		if (!context) {
			await markNotificationIgnored(
				notificationId,
				"due command context not found",
			);
			return;
		}

		if (
			context.commandType === "due" &&
			!context.housemate &&
			!context.requestedFirstName
		) {
			await markNotificationIgnored(
				notificationId,
				"unknown WhatsApp sender for due command",
			);
			return;
		}

		if (isGroupInboundContext(context) && !context.housemate) {
			await markNotificationIgnored(
				notificationId,
				"unknown WhatsApp sender for group command",
			);
			return;
		}

		if (commandShouldReceiveReaction(context.commandType)) {
			await reactToDueCommand(notificationId);
		}
		await sendDueCommandSummary(notificationId);
		await markNotificationCompleted(notificationId);
	} catch (error) {
		await markNotificationFailed(notificationId, toErrorMessage(error));
		throw error;
	}
}

function commandShouldReceiveReaction(commandType: InboundCommandType) {
	return commandType !== "pay" && commandType !== "not_allowed";
}

function isGroupInboundContext(
	context: NonNullable<Awaited<ReturnType<typeof loadDueCommandContext>>>,
) {
	return context.notification.inboundChatId?.endsWith("@g.us") ?? false;
}

async function loadDueCommandContext(notificationId: string) {
	"use step";

	const { getDueCommandNotificationContext } = await import(
		"../src/api/services/whatsapp-notifications"
	);
	return await getDueCommandNotificationContext(notificationId);
}

async function reactToDueCommand(notificationId: string) {
	"use step";

	const context = await loadDueCommandContext(notificationId);
	if (!context?.notification.inboundMessageId) {
		throw new FatalError(
			`Missing due-command message ID for notification ${notificationId}`,
		);
	}
	const messageId = context.notification.inboundMessageId;
	const { reactToWhatsappMessage } = await import("../src/api/services/waha");

	await performTrackedWhatsappDelivery({
		notificationId,
		deliveryKey: "due_command_reaction",
		operation: "due command WhatsApp reaction",
		deliver: async () => {
			await reactToWhatsappMessage(messageId, "✅");
			return undefined;
		},
	});
}

reactToDueCommand.maxRetries = 1;

async function sendDueCommandSummary(notificationId: string) {
	"use step";

	const context = await requireDueCommandContext(notificationId);
	const dependencies = await loadDueCommandSummaryDependencies();

	if (context.commandType === "init") {
		await sendInitCommandSummary({ notificationId, context, dependencies });
		return;
	}

	if (context.commandType === "paylinks") {
		await sendPayLinksCommandSummary({ notificationId, context, dependencies });
		return;
	}

	if (context.commandType === "reminder") {
		await sendReminderPreviewSummary({ notificationId, context, dependencies });
		return;
	}

	await sendDefaultInboundCommandSummary({
		notificationId,
		context,
		dependencies,
	});
}

async function loadDueCommandSummaryDependencies() {
	const {
		buildBillPaidSummary,
		buildAdminPayLinksSummary,
		buildDueCommandNotFoundSummary,
		buildInitBillsSummary,
		buildInitIntroSummary,
		buildNotAllowedSummary,
		buildOverdueDigestPreviewSummary,
		buildPayLinkSummary,
		buildUnknownHousematePaySummary,
	} = await import("../src/api/services/whatsapp-message-composer");
	const { BillPdfStorageService } = await import(
		"../src/api/services/bill-pdf-storage"
	);
	const { createAbsolutePayUrl } = await import(
		"../src/api/services/housemate-pay-page.server"
	);
	const {
		getActiveHousematePaymentNames,
		getCurrentUnpaidBillSummaries,
		getHousematePayLinkBatch,
		getRandomBillPaidPreviewContext,
		getRandomBillPreviewContext,
	} = await import("../src/api/services/whatsapp-notifications");
	const { composeOverdueDigest, getOverdueDigests } = await import(
		"../src/api/services/overdue-digest.server"
	);
	const { sydneyDate } = await import("../src/api/services/overdue-digest");
	const { sendWhatsappTextMessage } = await import("../src/api/services/waha");
	const previewDate = BillPdfStorageService.getMessageCacheDate();
	const housematePaymentNames = await getActiveHousematePaymentNames();

	return {
		buildAdminPayLinksSummary,
		buildBillPaidSummary,
		buildDueCommandNotFoundSummary,
		buildInitBillsSummary,
		buildInitIntroSummary,
		buildNotAllowedSummary,
		buildOverdueDigestPreviewSummary,
		buildPayLinkSummary,
		buildUnknownHousematePaySummary,
		composeOverdueDigest,
		createAbsolutePayUrl,
		getAbsoluteViewerUrl: BillPdfStorageService.getAbsoluteViewerUrl.bind(
			BillPdfStorageService,
		),
		getCurrentUnpaidBillSummaries,
		getHousematePayLinkBatch,
		getRandomBillPaidPreviewContext,
		getOverdueDigests,
		getRandomBillPreviewContext,
		housematePaymentNames,
		previewDate,
		sendWhatsappTextMessage,
		sydneyDate,
	};
}

type DueCommandContext = NonNullable<
	Awaited<ReturnType<typeof loadDueCommandContext>>
>;
type DueCommandSummaryDependencies = Awaited<
	ReturnType<typeof loadDueCommandSummaryDependencies>
>;

type SendDueCommandBranchArgs = {
	notificationId: string;
	context: DueCommandContext;
	dependencies: DueCommandSummaryDependencies;
};

async function sendInitCommandSummary({
	notificationId,
	context,
	dependencies,
}: SendDueCommandBranchArgs) {
	const groupChatId = context.notification.inboundChatId;
	if (!groupChatId) {
		throw new FatalError("Unable to resolve a group chat for /init");
	}

	const currentBills = await dependencies.getCurrentUnpaidBillSummaries();
	await performTrackedWhatsappDelivery({
		notificationId,
		deliveryKey: "init_intro",
		operation: "/init intro WhatsApp message",
		deliver: async () =>
			await dependencies.sendWhatsappTextMessage(
				groupChatId,
				dependencies.buildInitIntroSummary(),
			),
	});
	await performTrackedWhatsappDelivery({
		notificationId,
		deliveryKey: "init_bill_snapshot",
		operation: "/init bill snapshot WhatsApp message",
		deliver: async () =>
			await dependencies.sendWhatsappTextMessage(
				groupChatId,
				dependencies.buildInitBillsSummary({
					asOf: new Date(),
					totalOutstanding: currentBills.totalOutstanding,
					bills: currentBills.bills,
				}),
			),
	});
}

async function sendPayLinksCommandSummary({
	notificationId,
	context,
	dependencies,
}: SendDueCommandBranchArgs) {
	const chatId = context.replyChatId;
	if (!chatId) {
		throw new FatalError("Unable to resolve an admin chat for /paylinks");
	}

	const payLinkBatch = await dependencies.getHousematePayLinkBatch(
		dependencies.previewDate,
	);
	const sentHousemateNames: string[] = [];

	for (const target of payLinkBatch.deliverableTargets) {
		if (!target.chatId || !target.payUrl) {
			continue;
		}
		const targetChatId = target.chatId;
		const targetPayUrl = target.payUrl;

		await performTrackedWhatsappDelivery({
			notificationId,
			deliveryKey: `paylinks_${target.housemateId}`,
			operation: `/paylinks DM for ${target.housemateName}`,
			deliver: async () =>
				await dependencies.sendWhatsappTextMessage(
					targetChatId,
					dependencies.buildPayLinkSummary({
						payUrl: targetPayUrl,
						housemateName: target.housemateName,
						housemateFirstNames: dependencies.housematePaymentNames,
					}),
				),
		});
		sentHousemateNames.push(target.housemateName);
	}

	await performTrackedWhatsappDelivery({
		notificationId,
		deliveryKey: "paylinks_summary",
		operation: "/paylinks admin WhatsApp summary",
		deliver: async () =>
			await dependencies.sendWhatsappTextMessage(
				chatId,
				dependencies.buildAdminPayLinksSummary({
					sentHousemateNames,
					skippedRecipients: payLinkBatch.skippedTargets.map((target) => ({
						housemateName: target.housemateName,
						reason: target.reason,
					})),
				}),
			),
	});
}

// Shows the admin exactly what today's overdue digests would say, without
// sending anything to the housemates.
async function sendReminderPreviewSummary({
	notificationId,
	context,
	dependencies,
}: SendDueCommandBranchArgs) {
	const now = new Date();
	const digests = await dependencies.getOverdueDigests(now);
	const messages = digests.map((entry) => {
		const message = dependencies.composeOverdueDigest(
			entry,
			dependencies.previewDate,
		);
		if (!message) {
			throw new FatalError("Unable to build a pay link for digest preview");
		}
		return message;
	});

	await performTrackedWhatsappDelivery({
		notificationId,
		deliveryKey: "reminder_preview_summary",
		operation: "/reminder admin WhatsApp summary",
		deliver: async () =>
			await dependencies.sendWhatsappTextMessage(
				context.replyChatId,
				dependencies.buildOverdueDigestPreviewSummary({
					date: dependencies.sydneyDate(now),
					digests: digests.map((entry) => ({
						housemateName: entry.housemate.name,
						overdueCents: entry.digest.overdueCents,
					})),
				}),
			),
	});

	for (const [index, message] of messages.entries()) {
		await performTrackedWhatsappDelivery({
			notificationId,
			deliveryKey: `reminder_preview_message_${index + 1}`,
			operation: `/reminder WhatsApp preview ${index + 1}`,
			deliver: async () =>
				await dependencies.sendWhatsappTextMessage(
					context.replyChatId,
					message,
				),
		});
	}
}

async function sendDefaultInboundCommandSummary({
	notificationId,
	context,
	dependencies,
}: SendDueCommandBranchArgs) {
	const chatId = context.replyChatId;
	if (!chatId) {
		throw new FatalError(
			"Unable to resolve a private WhatsApp chat for inbound response",
		);
	}

	const messages = toWhatsappMessages(
		await buildInboundCommandResponse({
			commandType: context.commandType,
			context,
			buildBillPaidSummary: dependencies.buildBillPaidSummary,
			buildDueCommandNotFoundSummary:
				dependencies.buildDueCommandNotFoundSummary,
			buildNotAllowedSummary: dependencies.buildNotAllowedSummary,
			buildPayLinkSummary: dependencies.buildPayLinkSummary,
			buildUnknownHousematePaySummary:
				dependencies.buildUnknownHousematePaySummary,
			getAbsoluteViewerUrl: dependencies.getAbsoluteViewerUrl,
			getRandomBillPreviewContext: dependencies.getRandomBillPreviewContext,
			getRandomBillPaidPreviewContext:
				dependencies.getRandomBillPaidPreviewContext,
			createAbsolutePayUrl: dependencies.createAbsolutePayUrl,
			previewDate: dependencies.previewDate,
			housematePaymentNames: dependencies.housematePaymentNames,
		}),
	);

	for (const [index, message] of messages.entries()) {
		const deliveryKey =
			messages.length === 1
				? "due_command_summary"
				: `due_command_summary_${index + 1}`;
		await performTrackedWhatsappDelivery({
			notificationId,
			deliveryKey,
			operation:
				messages.length === 1
					? "inbound command WhatsApp summary"
					: `inbound command WhatsApp summary ${index + 1}`,
			deliver: async () =>
				await dependencies.sendWhatsappTextMessage(chatId, message),
		});
	}
}

sendDueCommandSummary.maxRetries = 2;

async function markNotificationCompleted(notificationId: string) {
	"use step";

	const { markWhatsappNotificationCompleted } = await import(
		"../src/api/services/whatsapp-notifications"
	);
	await markWhatsappNotificationCompleted(notificationId);
	emitWorkflowOutcome({
		workflowName: "inbound-command",
		notificationId,
		stepName: "mark-completed",
		outcome: "completed",
		message: "inbound-command workflow completed",
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
		workflowName: "inbound-command",
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

	const context = await loadDueCommandContext(notificationId);
	const { markWhatsappNotificationIgnored } = await import(
		"../src/api/services/whatsapp-notifications"
	);
	await markWhatsappNotificationIgnored(notificationId, errorMessage);
	emitWorkflowOutcome({
		workflowName: "inbound-command",
		notificationId,
		stepName: "mark-ignored",
		outcome: "ignored",
		message: errorMessage,
		context: context?.inboundSenderWhatsappNumber
			? {
					whatsappCommand: {
						senderNumber: context.inboundSenderWhatsappNumber,
					},
				}
			: undefined,
	});
}

async function requireDueCommandContext(notificationId: string) {
	const context = await loadDueCommandContext(notificationId);
	if (!context?.replyChatId) {
		throw new FatalError(
			`Missing due-command context for notification ${notificationId}`,
		);
	}

	return context;
}

function toErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

type CreateAbsolutePayUrlFn = (
	input: {
		housemateId: string;
		stackGroup?: string | null;
	},
	previewDate?: string | null,
) => string | null;

type BillPreviewContext = {
	bill: {
		id: string;
	};
} | null;

type BillPaidPreviewContext = {
	bill: {
		id: string;
	};
} | null;

type DueCommandReplyArgs = {
	housemate: {
		id: string;
		name: string;
	};
	createAbsolutePayUrl: CreateAbsolutePayUrlFn;
	previewDate: string;
};

type InboundCommandContext = Awaited<ReturnType<typeof loadDueCommandContext>>;

type BuildInboundCommandResponseArgs = {
	commandType: InboundCommandType;
	context: NonNullable<InboundCommandContext>;
	buildBillPaidSummary: (input: { billUrl: string }) => string;
	buildDueCommandNotFoundSummary: (firstName: string) => string;
	buildNotAllowedSummary: () => string;
	buildPayLinkSummary: (input: {
		payUrl: string;
		housemateName: string;
		housemateFirstNames: string[];
	}) => string;
	buildUnknownHousematePaySummary: () => string;
	getAbsoluteViewerUrl: (
		billReference: string | number,
		previewDate?: string | null,
	) => string | null;
	getRandomBillPaidPreviewContext: () => Promise<BillPaidPreviewContext>;
	getRandomBillPreviewContext: () => Promise<BillPreviewContext>;
	createAbsolutePayUrl: CreateAbsolutePayUrlFn;
	previewDate: string;
	housematePaymentNames: string[];
};

function toWhatsappMessages(message: string | string[]) {
	return Array.isArray(message) ? message : [message];
}

function buildDueCommandReply(args: DueCommandReplyArgs) {
	const payUrl = args.createAbsolutePayUrl(
		{
			housemateId: args.housemate.id,
		},
		args.previewDate,
	);
	if (!payUrl) {
		throw new FatalError("Unable to build a pay link for due command");
	}

	return payUrl;
}

async function buildInboundCommandResponse(
	args: BuildInboundCommandResponseArgs,
) {
	switch (args.commandType) {
		case "due":
			return buildDueCommandResponseMessage(args);
		case "new":
			return await buildNewCommandResponse(args);
		case "paid":
		case "billpaid":
			return await buildBillPaidCommandResponse(args);
		case "reminder":
			throw new FatalError(
				"reminder should be handled before building a direct response",
			);
		case "pay":
			return buildPayCommandResponseMessage(args);
		case "not_allowed":
			return args.buildNotAllowedSummary();
		case "init":
		case "paylinks":
			throw new FatalError(
				`${args.commandType} should be handled before building a direct response`,
			);
	}
}

async function buildNewCommandResponse(args: BuildInboundCommandResponseArgs) {
	const billContext = await args.getRandomBillPreviewContext();
	if (!billContext) {
		return "*No bills found.* Add a bill first, then try /new again.";
	}

	const billUrl = args.getAbsoluteViewerUrl(
		billContext.bill.id,
		args.previewDate,
	);
	if (!billUrl) {
		throw new FatalError("Unable to build a bill link for new command");
	}

	return billUrl;
}

async function buildBillPaidCommandResponse(
	args: BuildInboundCommandResponseArgs,
) {
	const billPaidContext = await args.getRandomBillPaidPreviewContext();
	if (!billPaidContext) {
		return "*No paid group bills found.* Mark a shared bill paid first, then try /billpaid again.";
	}

	const billUrl = args.getAbsoluteViewerUrl(
		billPaidContext.bill.id,
		args.previewDate,
	);
	if (!billUrl) {
		throw new FatalError("Unable to build a bill link for billpaid command");
	}

	return args.buildBillPaidSummary({ billUrl });
}

function buildDueCommandResponseMessage(args: BuildInboundCommandResponseArgs) {
	if (!args.context.housemate) {
		return args.buildDueCommandNotFoundSummary(
			args.context.requestedFirstName ?? "that housemate",
		);
	}

	return buildDueCommandReply({
		housemate: args.context.housemate,
		createAbsolutePayUrl: args.createAbsolutePayUrl,
		previewDate: args.previewDate,
	});
}

function buildPayCommandResponseMessage(args: BuildInboundCommandResponseArgs) {
	if (!args.context.housemate) {
		return args.buildUnknownHousematePaySummary();
	}

	const payUrl = args.createAbsolutePayUrl(
		{
			housemateId: args.context.housemate.id,
		},
		args.previewDate,
	);
	if (!payUrl) {
		throw new FatalError("Unable to build a pay link for pay response");
	}

	return args.buildPayLinkSummary({
		payUrl,
		housemateName: args.context.housemate.name,
		housemateFirstNames: args.housematePaymentNames,
	});
}
