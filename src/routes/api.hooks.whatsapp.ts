import { createHmac, timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { type RequestLogger, createError } from "evlog";
import {
	getConfiguredWhatsappGroupChatId,
	getWahaWebhookSecret,
	getWhatsappAdminChatId,
} from "../api/services/waha";
import {
	enqueueAssistantMessageNotification,
	enqueueDueCommandNotification,
} from "../api/services/whatsapp-notification-events";
import { whatsappChatIdToNumber } from "../api/services/whatsapp-phone";
import { setApiRequestContext, setApiResponseContext } from "../lib/api-log";
import { getRequestLogger } from "../lib/request-logger";
import { parseInboundWhatsappCommand } from "../lib/whatsapp-commands";

type WahaGroupMessage = {
	body: string;
	chatId: string;
	messageId: string;
	sessionName: string | null;
	senderChatId: string;
};

const DUE_COMMAND_KEYWORD = "due";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function getStringValue(value: unknown) {
	return typeof value === "string" ? value : null;
}

function isGroupChatId(chatId: string) {
	return chatId.endsWith("@g.us");
}

function chatIdsMatch(left: string, right: string) {
	if (left === right) {
		return true;
	}

	const leftNumber = whatsappChatIdToNumber(left);
	const rightNumber = whatsappChatIdToNumber(right);

	return leftNumber !== null && leftNumber === rightNumber;
}

function isAllowedInboundChat(
	incomingChatId: string,
	configuredChatId: string,
) {
	if (chatIdsMatch(incomingChatId, configuredChatId)) {
		return true;
	}

	// In local dev we often route commands through a personal chat, and WAHA can
	// surface that chat as an opaque @lid even when the configured value is @c.us.
	// When the configured target is not a group chat, accept direct-message mode.
	return (
		!configuredChatId.endsWith("@g.us") && !incomingChatId.endsWith("@g.us")
	);
}

function isDueOverrideAllowed(input: {
	senderChatId: string;
	adminChatId: string | null;
}) {
	if (!input.adminChatId) {
		return false;
	}

	return chatIdsMatch(input.senderChatId, input.adminChatId);
}

function isValidWebhookHmac(input: {
	rawBody: string;
	secret: string;
	providedHmac: string | null;
	algorithm: string | null;
}) {
	if (
		!input.providedHmac ||
		!input.algorithm ||
		input.algorithm.toLowerCase() !== "sha512"
	) {
		return false;
	}

	const expectedHmac = createHmac("sha512", input.secret)
		.update(input.rawBody)
		.digest("hex");

	const providedBuffer = Buffer.from(input.providedHmac, "hex");
	const expectedBuffer = Buffer.from(expectedHmac, "hex");

	if (
		providedBuffer.byteLength === 0 ||
		providedBuffer.byteLength !== expectedBuffer.byteLength
	) {
		return false;
	}

	return timingSafeEqual(providedBuffer, expectedBuffer);
}

function parseWahaGroupMessage(payload: unknown): WahaGroupMessage | null {
	if (!isRecord(payload)) {
		return null;
	}

	const eventName = getStringValue(payload.event);
	const sessionName = getStringValue(payload.session);
	const container = isRecord(payload.payload)
		? payload.payload
		: isRecord(payload.data)
			? payload.data
			: null;

	if (!container) {
		return null;
	}

	const directMessage = {
		body: getStringValue(container.body),
		chatId: getStringValue(container.from),
		messageId: getStringValue(container.id),
		senderChatId:
			getStringValue(container.sender) ?? getStringValue(container.from),
	};
	if (
		(eventName === "message.group" || eventName === "message") &&
		directMessage.body &&
		directMessage.chatId &&
		directMessage.messageId &&
		directMessage.senderChatId
	) {
		return {
			body: directMessage.body,
			chatId: directMessage.chatId,
			messageId: directMessage.messageId,
			sessionName,
			senderChatId: directMessage.senderChatId,
		};
	}

	const nestedMessage = isRecord(container.message) ? container.message : null;
	const nestedBody = getStringValue(nestedMessage?.body);
	const nestedSenderChatId = getStringValue(nestedMessage?.from);
	const nestedChatId =
		getStringValue(container.from) ?? getStringValue(container.id);
	const nestedMessageId =
		getStringValue(nestedMessage?.id) ?? getStringValue(container.id);

	if (
		(eventName === "message.group" || eventName === "message") &&
		nestedBody &&
		(nestedSenderChatId ?? nestedChatId) &&
		nestedChatId &&
		nestedMessageId
	) {
		return {
			body: nestedBody,
			chatId: nestedChatId,
			messageId: nestedMessageId,
			sessionName,
			senderChatId: nestedSenderChatId ?? nestedChatId,
		};
	}

	return null;
}

export const Route = createFileRoute("/api/hooks/whatsapp")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const log = getRequestLogger() as RequestLogger | undefined;
				setApiRequestContext(log, request, {
					operation: "whatsapp_webhook",
				});
				log?.set({
					webhook: {
						provider: "waha",
					},
				});

				const rawBody = await request.text();
				const webhookSecret = getWahaWebhookSecret();
				const providedHmac = request.headers.get("x-webhook-hmac");
				const hmacAlgorithm = request.headers.get("x-webhook-hmac-algorithm");

				const isAuthorized = isValidWebhookHmac({
					rawBody,
					secret: webhookSecret,
					providedHmac,
					algorithm: hmacAlgorithm,
				});

				if (!isAuthorized) {
					throw createError({
						message: "Unauthorized",
						status: 401,
						why: "The WAHA webhook authentication headers were missing or invalid.",
						fix: "Configure WAHA with hmac.key and verify X-Webhook-Hmac using the shared secret and raw request body.",
					});
				}

				let payload: unknown;
				try {
					payload = JSON.parse(rawBody);
				} catch {
					throw createError({
						message: "Invalid webhook payload",
						status: 400,
						why: "The WAHA webhook body was not valid JSON.",
						fix: "Ensure WAHA posts the webhook body as raw JSON.",
					});
				}

				const groupMessage = parseWahaGroupMessage(payload);
				if (!groupMessage) {
					setApiResponseContext(
						log,
						{ contentType: "application/json" },
						{
							webhook: {
								provider: "waha",
								ignored: true,
								ignoreReason: "unsupported_event",
							},
						},
					);
					return Response.json({
						success: true,
						ignored: true,
						reason: "unsupported_event",
					});
				}

				const configuredChatId = getConfiguredWhatsappGroupChatId();
				const isPrivateChat = !isGroupChatId(groupMessage.chatId);

				if (
					!isPrivateChat &&
					!isAllowedInboundChat(groupMessage.chatId, configuredChatId)
				) {
					setApiResponseContext(
						log,
						{ contentType: "application/json" },
						{
							webhook: {
								provider: "waha",
								ignored: true,
								ignoreReason: "unexpected_group",
							},
						},
					);
					return Response.json({
						success: true,
						ignored: true,
						reason: "unexpected_group",
					});
				}

				const parsedCommand = parseInboundWhatsappCommand({
					body: groupMessage.body,
					dueKeyword: DUE_COMMAND_KEYWORD,
				});
				const isAdminSender = isDueOverrideAllowed({
					senderChatId: groupMessage.senderChatId,
					adminChatId: getWhatsappAdminChatId(),
				});

				if (isPrivateChat && !(isAdminSender && parsedCommand)) {
					await enqueueAssistantMessageNotification({
						messageId: groupMessage.messageId,
						chatId: groupMessage.chatId,
						senderChatId: groupMessage.senderChatId,
						body: groupMessage.body,
						sessionName: groupMessage.sessionName,
					});

					setApiResponseContext(log, {
						contentType: "application/json",
					});
					return Response.json({
						success: true,
						queued: true,
					});
				}

				const commandDetails = (() => {
					if (isPrivateChat) {
						if (!parsedCommand) {
							return null;
						}

						return {
							commandType: parsedCommand.commandType,
							requestedFirstName:
								parsedCommand.commandType === "due"
									? parsedCommand.requestedFirstName
									: null,
						} as const;
					}

					if (isAdminSender && !parsedCommand) {
						return null;
					}

					if (isAdminSender) {
						if (!parsedCommand) {
							throw createError({
								message: "Admin command must be parsed before enqueue",
								status: 500,
								why: "The admin-only WhatsApp command branch reached enqueue without a parsed inbound command.",
								fix: "Ensure admin commands are parsed before enqueueing a WhatsApp notification workflow.",
							});
						}

						return {
							commandType: parsedCommand.commandType,
							requestedFirstName:
								parsedCommand.commandType === "due"
									? parsedCommand.requestedFirstName
									: null,
						} as const;
					}

					return {
						commandType:
							parsedCommand?.commandType === "init" ||
							parsedCommand?.commandType === "paylinks" ||
							parsedCommand?.commandType === "reminder"
								? "not_allowed"
								: "pay",
						requestedFirstName: null,
					} as const;
				})();

				if (!commandDetails) {
					setApiResponseContext(
						log,
						{ contentType: "application/json" },
						{
							webhook: {
								provider: "waha",
								ignored: true,
								ignoreReason: "unsupported_command",
							},
						},
					);
					return Response.json({
						success: true,
						ignored: true,
						reason: "unsupported_command",
					});
				}

				await enqueueDueCommandNotification({
					messageId: groupMessage.messageId,
					groupChatId: groupMessage.chatId,
					senderChatId: groupMessage.senderChatId,
					body: groupMessage.body,
					sessionName: groupMessage.sessionName,
					commandType: commandDetails.commandType,
					requestedFirstName: commandDetails.requestedFirstName,
				});

				setApiResponseContext(log, {
					contentType: "application/json",
				});
				return Response.json({
					success: true,
					queued: true,
				});
			},
		},
	},
});
