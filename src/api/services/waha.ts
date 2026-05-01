// fallow-ignore-file code-duplication
import { createError } from "evlog";
import {
	whatsappChatIdToNumber,
	whatsappNumberToChatId,
} from "./whatsapp-phone";

interface WahaSuccessResponse {
	id?: string;
	status?: string;
	messageId?: string;
	[key: string]: unknown;
}

type WahaLidMappingResponse = {
	lid?: string;
	pn?: string | null;
};

type WhatsappLinkPreview = {
	url: string;
	title: string;
	description: string;
	image: {
		url: string;
	};
};

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

type WhatsappButton =
	| WhatsappUrlButton
	| WhatsappReplyButton
	| WhatsappCallButton
	| WhatsappCopyButton;

class WahaRequestError extends Error {
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

const WAHA_REQUEST_TIMEOUT_MS = 60_000;
const LINK_PREVIEW_REQUEST_TIMEOUT_MS = 15_000;
const MAX_LINK_PREVIEW_CANDIDATES = 5;
const HTTP_URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const TRAILING_URL_PUNCTUATION_PATTERN = /[),.;:!?]+$/;

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

function getWahaSessionName() {
	return process.env.WAHA_SESSION_NAME?.trim() || "default";
}

function getConfiguredAppOrigin() {
	const baseUrl = process.env.VITE_BASE_URL?.trim();
	if (!baseUrl) {
		return null;
	}

	try {
		return new URL(baseUrl).origin;
	} catch {
		return null;
	}
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

function normalizeTextUrl(rawUrl: string) {
	const cleanedUrl = rawUrl.replace(TRAILING_URL_PUNCTUATION_PATTERN, "");

	try {
		const url = new URL(cleanedUrl);
		return url.protocol === "http:" || url.protocol === "https:"
			? url.toString()
			: null;
	} catch {
		return null;
	}
}

function getTextUrls(text: string) {
	const matches = text.match(HTTP_URL_PATTERN) ?? [];
	const urls = matches
		.map(normalizeTextUrl)
		.filter((url): url is string => Boolean(url));

	return [...new Set(urls)];
}

function isCustomPreviewUrl(url: string) {
	const appOrigin = getConfiguredAppOrigin();
	if (!appOrigin) {
		return false;
	}

	try {
		return new URL(url).origin === appOrigin;
	} catch {
		return false;
	}
}

function decodeHtmlEntities(value: string) {
	const namedEntities: Record<string, string> = {
		"#39": "'",
		amp: "&",
		apos: "'",
		gt: ">",
		lt: "<",
		quot: '"',
	};

	return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (entity, name) => {
		const normalizedName = String(name).toLowerCase();
		if (normalizedName.startsWith("#x")) {
			return String.fromCodePoint(Number.parseInt(normalizedName.slice(2), 16));
		}

		if (normalizedName.startsWith("#")) {
			return String.fromCodePoint(Number.parseInt(normalizedName.slice(1), 10));
		}

		return namedEntities[normalizedName] ?? entity;
	});
}

function getHtmlAttribute(tag: string, attributeName: string) {
	const attributePattern = new RegExp(
		`\\s${attributeName}\\s*=\\s*(["'])(.*?)\\1`,
		"i",
	);
	const match = tag.match(attributePattern);
	return match?.[2] ? decodeHtmlEntities(match[2].trim()) : null;
}

function getMetaContent(html: string, keys: string[]) {
	const keySet = new Set(keys.map((key) => key.toLowerCase()));
	const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];

	for (const tag of metaTags) {
		const key =
			getHtmlAttribute(tag, "property") ?? getHtmlAttribute(tag, "name");
		const content = getHtmlAttribute(tag, "content");
		if (key && content && keySet.has(key.toLowerCase())) {
			return content;
		}
	}

	return null;
}

function getHtmlTitle(html: string) {
	const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
	return match?.[1] ? decodeHtmlEntities(match[1].trim()) : null;
}

function getAbsolutePreviewImageUrl(imageUrl: string | null, pageUrl: string) {
	if (!imageUrl) {
		return null;
	}

	try {
		return new URL(imageUrl, pageUrl).toString();
	} catch {
		return null;
	}
}

function extractLinkPreview(
	html: string,
	url: string,
): WhatsappLinkPreview | null {
	const title =
		getMetaContent(html, ["og:title", "twitter:title"]) ?? getHtmlTitle(html);
	const description = getMetaContent(html, [
		"og:description",
		"twitter:description",
		"description",
	]);
	const imageUrl = getAbsolutePreviewImageUrl(
		getMetaContent(html, ["og:image", "twitter:image"]),
		url,
	);

	if (!title || !description || !imageUrl) {
		return null;
	}

	return {
		url,
		title,
		description,
		image: {
			url: imageUrl,
		},
	};
}

async function fetchLinkPreview(url: string) {
	const abortController = new AbortController();
	const timeoutId = setTimeout(() => {
		abortController.abort(
			new Error(
				`Link preview metadata request timed out after ${LINK_PREVIEW_REQUEST_TIMEOUT_MS}ms`,
			),
		);
	}, LINK_PREVIEW_REQUEST_TIMEOUT_MS);

	try {
		const response = await fetch(url, {
			headers: {
				Accept: "text/html,application/xhtml+xml",
				"User-Agent": "sharehouse-bills-whatsapp-preview/1.0",
			},
			signal: abortController.signal,
		});
		if (!response.ok) {
			return null;
		}

		const contentType = response.headers.get("content-type") ?? "";
		if (contentType && !contentType.toLowerCase().includes("text/html")) {
			return null;
		}

		return extractLinkPreview(await response.text(), url);
	} catch {
		return null;
	} finally {
		clearTimeout(timeoutId);
	}
}

async function resolveMessageLinkPreview(text: string) {
	const previewUrls = getTextUrls(text)
		.filter(isCustomPreviewUrl)
		.slice(0, MAX_LINK_PREVIEW_CANDIDATES);

	for (const url of previewUrls) {
		const preview = await fetchLinkPreview(url);
		if (preview) {
			return preview;
		}
	}

	return null;
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
	const abortController = new AbortController();
	const timeoutId = setTimeout(() => {
		abortController.abort(
			new Error(`WAHA request timed out after ${WAHA_REQUEST_TIMEOUT_MS}ms`),
		);
	}, WAHA_REQUEST_TIMEOUT_MS);

	try {
		response = await fetch(`${getWahaBaseUrl()}${path}`, {
			method: options.method,
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
				"X-Api-Key": getWahaApiKey(),
			},
			body: JSON.stringify(normalizedBody),
			signal: abortController.signal,
		});
	} catch (error) {
		const isAbortError =
			error instanceof Error &&
			(error.name === "AbortError" ||
				error.message.includes("timed out after"));
		throw new WahaRequestError({
			message: isAbortError
				? `WAHA request timed out after ${WAHA_REQUEST_TIMEOUT_MS}ms`
				: "WAHA request failed before a response was received",
			cause: error,
		});
	} finally {
		clearTimeout(timeoutId);
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

async function wahaGet<TResponse>(path: string) {
	let response: Response;
	const abortController = new AbortController();
	const timeoutId = setTimeout(() => {
		abortController.abort(
			new Error(`WAHA request timed out after ${WAHA_REQUEST_TIMEOUT_MS}ms`),
		);
	}, WAHA_REQUEST_TIMEOUT_MS);

	try {
		response = await fetch(`${getWahaBaseUrl()}${path}`, {
			method: "GET",
			headers: {
				Accept: "application/json",
				"X-Api-Key": getWahaApiKey(),
			},
			signal: abortController.signal,
		});
	} catch (error) {
		const isAbortError =
			error instanceof Error &&
			(error.name === "AbortError" ||
				error.message.includes("timed out after"));
		throw new WahaRequestError({
			message: isAbortError
				? `WAHA request timed out after ${WAHA_REQUEST_TIMEOUT_MS}ms`
				: "WAHA request failed before a response was received",
			cause: error,
		});
	} finally {
		clearTimeout(timeoutId);
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

export async function resolveWhatsappChatIdToNumber(
	chatId: string | null | undefined,
) {
	if (!chatId) {
		return null;
	}

	const trimmedChatId = chatId.trim();
	if (!trimmedChatId) {
		return null;
	}

	if (!trimmedChatId.endsWith("@lid")) {
		return whatsappChatIdToNumber(trimmedChatId);
	}

	try {
		const sessionName = encodeURIComponent(getWahaSessionName());
		const encodedLid = encodeURIComponent(trimmedChatId);
		const response = await wahaGet<WahaLidMappingResponse>(
			`/api/${sessionName}/lids/${encodedLid}`,
		);

		return whatsappChatIdToNumber(response.pn ?? null);
	} catch {
		return null;
	}
}

export async function sendWhatsappTextMessage(chatId: string, text: string) {
	const preview = await resolveMessageLinkPreview(text);
	if (preview) {
		return await wahaRequest<WahaSuccessResponse>(
			"/api/send/link-custom-preview",
			{
				method: "POST",
				body: {
					chatId,
					text,
					linkPreview: true,
					linkPreviewHighQuality: true,
					preview,
				},
			},
		);
	}

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
