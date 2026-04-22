import { FatalError } from "workflow";
import type { InboundCommandType } from "../src/lib/whatsapp-commands";
import { performTrackedWhatsappDelivery } from "./whatsapp-delivery";

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
			await warnUnknownSender(notificationId);
			await markNotificationIgnored(
				notificationId,
				"unknown WhatsApp sender for due command",
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

async function loadDueCommandContext(notificationId: string) {
	"use step";

	const { getDueCommandNotificationContext } = await import(
		"../src/api/services/whatsapp-notifications"
	);
	return await getDueCommandNotificationContext(notificationId);
}

async function warnUnknownSender(notificationId: string) {
	"use step";

	const context = await loadDueCommandContext(notificationId);
	const senderNumber = context?.inboundSenderWhatsappNumber ?? "unknown";
	console.warn(
		`Ignoring WhatsApp due command from unknown sender ${senderNumber}`,
	);
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
	const {
		buildAdminPayLinksSummary,
		buildDueCommandNotFoundSummary,
		buildInitBillsSummary,
		buildInitIntroSummary,
		buildNotAllowedSummary,
		buildPayLinkSummary,
		buildUnknownHousematePaySummary,
	} = await import("../src/api/services/whatsapp-message-composer");
	const { BillPdfStorageService } = await import(
		"../src/api/services/bill-pdf-storage"
	);
	const { createAbsoluteDebtReceiptUrl } = await import(
		"../src/api/services/debt-receipt-page"
	);
	const { createAbsolutePayUrl } = await import(
		"../src/api/services/housemate-pay-page"
	);
	const {
		getActiveHousematePaymentNames,
		getCurrentUnpaidBillSummaries,
		getHousematePayLinkBatch,
		getRandomBillPaidPreviewContext,
		getRandomBillPreviewContext,
		getRandomDebtPaidPreviewContext,
	} = await import("../src/api/services/whatsapp-notifications");
	const { sendWhatsappTextMessage } = await import("../src/api/services/waha");
	const previewDate = BillPdfStorageService.getMessageCacheDate();
	const housematePaymentNames = await getActiveHousematePaymentNames();

	if (context.commandType === "init") {
		const groupChatId = context.notification.inboundChatId;
		if (!groupChatId) {
			throw new FatalError("Unable to resolve a group chat for /init");
		}

		const currentBills = await getCurrentUnpaidBillSummaries();
		await performTrackedWhatsappDelivery({
			notificationId,
			deliveryKey: "init_intro",
			operation: "/init intro WhatsApp message",
			deliver: async () =>
				await sendWhatsappTextMessage(groupChatId, buildInitIntroSummary()),
		});
		await performTrackedWhatsappDelivery({
			notificationId,
			deliveryKey: "init_bill_snapshot",
			operation: "/init bill snapshot WhatsApp message",
			deliver: async () =>
				await sendWhatsappTextMessage(
					groupChatId,
					buildInitBillsSummary({
						asOf: new Date(),
						totalOutstanding: currentBills.totalOutstanding,
						bills: currentBills.bills,
					}),
				),
		});
		return;
	}

	if (context.commandType === "paylinks") {
		const chatId = context.replyChatId;
		if (!chatId) {
			throw new FatalError("Unable to resolve an admin chat for /paylinks");
		}

		const payLinkBatch = await getHousematePayLinkBatch(previewDate);
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
					await sendWhatsappTextMessage(
						targetChatId,
						buildPayLinkSummary({
							payUrl: targetPayUrl,
							housemateName: target.housemateName,
							housemateFirstNames: housematePaymentNames,
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
				await sendWhatsappTextMessage(
					chatId,
					buildAdminPayLinksSummary({
						sentHousemateNames,
						skippedRecipients: payLinkBatch.skippedTargets.map((target) => ({
							housemateName: target.housemateName,
							reason: target.reason,
						})),
					}),
				),
		});
		return;
	}

	const chatId = context.replyChatId;
	if (!chatId) {
		throw new FatalError(
			"Unable to resolve a private WhatsApp chat for inbound response",
		);
	}

	await performTrackedWhatsappDelivery({
		notificationId,
		deliveryKey: "due_command_summary",
		operation: "inbound command WhatsApp summary",
		deliver: async () =>
			await sendWhatsappTextMessage(
				chatId,
				await buildInboundCommandResponse({
					commandType: context.commandType,
					context,
					buildDueCommandNotFoundSummary,
					buildNotAllowedSummary,
					buildPayLinkSummary,
					buildUnknownHousematePaySummary,
					createAbsoluteDebtReceiptUrl,
					getAbsoluteViewerUrl: BillPdfStorageService.getAbsoluteViewerUrl.bind(
						BillPdfStorageService,
					),
					getRandomBillPreviewContext,
					getRandomBillPaidPreviewContext,
					getRandomDebtPaidPreviewContext,
					createAbsolutePayUrl,
					previewDate,
					housematePaymentNames,
				}),
			),
	});
}

sendDueCommandSummary.maxRetries = 2;

async function markNotificationCompleted(notificationId: string) {
	"use step";

	const { markWhatsappNotificationCompleted } = await import(
		"../src/api/services/whatsapp-notifications"
	);
	await markWhatsappNotificationCompleted(notificationId);
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

type DebtPaidPreviewContext = {
	debt: {
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
	buildDueCommandNotFoundSummary: (firstName: string) => string;
	buildNotAllowedSummary: () => string;
	buildPayLinkSummary: (input: {
		payUrl: string;
		housemateName: string;
		housemateFirstNames: string[];
	}) => string;
	buildUnknownHousematePaySummary: () => string;
	createAbsoluteDebtReceiptUrl: (
		input: { debtId: string },
		previewDate?: string | null,
	) => string | null;
	getAbsoluteViewerUrl: (
		billReference: string | number,
		previewDate?: string | null,
	) => string | null;
	getRandomBillPreviewContext: () => Promise<BillPreviewContext>;
	getRandomBillPaidPreviewContext: () => Promise<BillPaidPreviewContext>;
	getRandomDebtPaidPreviewContext: () => Promise<DebtPaidPreviewContext>;
	createAbsolutePayUrl: CreateAbsolutePayUrlFn;
	previewDate: string;
	housematePaymentNames: string[];
};

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
			return await buildPaidCommandResponse(args);
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

async function buildPaidCommandResponse(args: BuildInboundCommandResponseArgs) {
	const [debtPaidContext, billPaidContext] = await Promise.all([
		args.getRandomDebtPaidPreviewContext(),
		args.getRandomBillPaidPreviewContext(),
	]);

	if (!debtPaidContext && !billPaidContext) {
		return "*No paid bills found.* Mark a bill paid first, then try /paid again.";
	}

	const sections: string[] = [];
	if (debtPaidContext) {
		const receiptUrl = args.createAbsoluteDebtReceiptUrl(
			{ debtId: debtPaidContext.debt.id },
			args.previewDate,
		);
		if (!receiptUrl) {
			throw new FatalError("Unable to build a receipt link for paid command");
		}
		sections.push(receiptUrl);
	}

	if (billPaidContext) {
		const billUrl = args.getAbsoluteViewerUrl(
			billPaidContext.bill.id,
			args.previewDate,
		);
		if (!billUrl) {
			throw new FatalError("Unable to build a bill link for paid command");
		}
		sections.push(billUrl);
	}

	return sections.join("\n\n");
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
