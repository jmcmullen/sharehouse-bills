import { createError } from "evlog";
import { whatsappNumberToChatId } from "./whatsapp-phone";

interface WahaSuccessResponse {
	status?: string;
	messageId?: string;
	[key: string]: unknown;
}

type WhatsappUrlButton = {
	type: "url";
	text: string;
	url: string;
};

type WhatsappReplyButton = {
	type: "reply";
	text: string;
};

type WhatsappCallButton = {
	type: "call";
	text: string;
	phoneNumber: string;
};

type WhatsappCopyButton = {
	type: "copy";
	text: string;
	copyCode: string;
};

export type WhatsappButton =
	| WhatsappUrlButton
	| WhatsappReplyButton
	| WhatsappCallButton
	| WhatsappCopyButton;

export class WahaRequestError extends Error {
	readonly status: number | null;
	readonly statusText: string | null;
	readonly responseText: string | null;
	readonly retryAfter: string | null;

	constructor(input: {
		message: string;
		status?: number | null;
		statusText?: string | null;
		responseText?: string | null;
		retryAfter?: string | null;
		cause?: unknown;
	}) {
		super(input.message, input.cause ? { cause: input.cause } : undefined);
		this.name = "WahaRequestError";
		this.status = input.status ?? null;
		this.statusText = input.statusText ?? null;
		this.responseText = input.responseText ?? null;
		this.retryAfter = input.retryAfter ?? null;
	}
}

function getWahaBaseUrl() {
	const baseUrl = process.env.WAHA_BASE_URL?.trim();
	if (!baseUrl) {
		throw createError({
			message: "WAHA_BASE_URL is not configured",
			status: 500,
			why: "The WhatsApp integration requires the WAHA base URL.",
			fix: "Set WAHA_BASE_URL to the HTTPS endpoint of your WAHA instance.",
		});
	}

	return baseUrl.replace(/\/+$/, "");
}

function getWahaApiKey() {
	const apiKey = process.env.WAHA_API_KEY?.trim();
	if (!apiKey) {
		throw createError({
			message: "WAHA_API_KEY is not configured",
			status: 500,
			why: "The WhatsApp integration requires an API key to authenticate with WAHA.",
			fix: "Set WAHA_API_KEY in the deployment environment.",
		});
	}

	return apiKey;
}

export function getWahaSessionName() {
	return process.env.WAHA_SESSION_NAME?.trim() || "default";
}

export function getConfiguredWhatsappGroupChatId() {
	const groupChatId = process.env.WHATSAPP_GROUP_CHAT_ID?.trim();
	if (!groupChatId) {
		throw createError({
			message: "WHATSAPP_GROUP_CHAT_ID is not configured",
			status: 500,
			why: "The bill notification flow requires a WhatsApp group chat ID.",
			fix: "Set WHATSAPP_GROUP_CHAT_ID to your WAHA group JID, for example 1234567890@g.us.",
		});
	}

	return groupChatId;
}

export function getWhatsappAdminChatId() {
	return process.env.WHATSAPP_ADMIN?.trim() || null;
}

export function getWahaWebhookSecret() {
	const webhookSecret = process.env.WAHA_WEBHOOK_SECRET?.trim();
	if (!webhookSecret) {
		throw createError({
			message: "WAHA_WEBHOOK_SECRET is not configured",
			status: 500,
			why: "Incoming WAHA webhooks need a shared secret for verification.",
			fix: "Configure WAHA webhook HMAC with the same shared secret value as WAHA_WEBHOOK_SECRET.",
		});
	}

	return webhookSecret;
}

export function getWahaChatIdForPhoneNumber(
	phoneNumber: string | null | undefined,
) {
	return whatsappNumberToChatId(phoneNumber);
}

async function wahaRequest<TResponse>(
	path: string,
	options: {
		method: "POST" | "PUT";
		body: Record<string, unknown>;
	},
) {
	let response: Response;
	const requestBody = {
		session: getWahaSessionName(),
		...options.body,
	};
	const normalizedBody =
		path === "/api/sendText"
			? {
					...requestBody,
					linkPreview: true,
					linkPreviewHighQuality: true,
				}
			: requestBody;

	try {
		response = await fetch(`${getWahaBaseUrl()}${path}`, {
			method: options.method,
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
				"X-Api-Key": getWahaApiKey(),
			},
			body: JSON.stringify(normalizedBody),
		});
	} catch (error) {
		throw new WahaRequestError({
			message: "WAHA request failed before a response was received",
			cause: error,
		});
	}

	if (!response.ok) {
		const responseText = await response.text();
		throw new WahaRequestError({
			message: `WAHA request failed (${response.status} ${response.statusText}): ${responseText}`,
			status: response.status,
			statusText: response.statusText,
			responseText,
			retryAfter: response.headers.get("retry-after"),
		});
	}

	if (response.status === 204) {
		return {} as TResponse;
	}

	const responseText = await response.text();
	if (!responseText.trim()) {
		return {} as TResponse;
	}

	try {
		return JSON.parse(responseText) as TResponse;
	} catch (error) {
		throw new WahaRequestError({
			message: `WAHA returned an invalid JSON success response: ${responseText}`,
			status: response.status,
			statusText: response.statusText,
			responseText,
			cause: error,
		});
	}
}

export async function sendWhatsappTextMessage(chatId: string, text: string) {
	return await wahaRequest<WahaSuccessResponse>("/api/sendText", {
		method: "POST",
		body: {
			chatId,
			text,
		},
	});
}

export async function sendWhatsappButtonsMessage(input: {
	chatId: string;
	header?: string;
	body: string;
	footer?: string;
	buttons: WhatsappButton[];
}) {
	return await wahaRequest<WahaSuccessResponse>("/api/sendButtons", {
		method: "POST",
		body: {
			chatId: input.chatId,
			header: input.header,
			body: input.body,
			footer: input.footer,
			buttons: input.buttons,
		},
	});
}

export async function sendWhatsappFileMessage(input: {
	chatId: string;
	filename: string;
	mimetype: string;
	data: string;
	caption?: string;
}) {
	return await wahaRequest<WahaSuccessResponse>("/api/sendFile", {
		method: "POST",
		body: {
			chatId: input.chatId,
			caption: input.caption,
			file: {
				filename: input.filename,
				mimetype: input.mimetype,
				data: input.data,
			},
		},
	});
}

export async function reactToWhatsappMessage(
	messageId: string,
	reaction: string,
) {
	return await wahaRequest<WahaSuccessResponse>("/api/reaction", {
		method: "PUT",
		body: {
			messageId,
			reaction,
		},
	});
}
