import { createFileRoute } from "@tanstack/react-router";
import { EvlogError, type RequestLogger, createError } from "evlog";
import { type EmailReceivedEvent, Resend } from "resend";
import type {
	FileAttachment,
	ProcessingResult,
} from "../api/services/bill-processor";
import { EmailNotifierService } from "../api/services/email-notifier";
import { setApiRequestContext, setApiResponseContext } from "../lib/api-log";
import { getRequestLogger } from "../lib/request-logger";

interface EmailMetadata {
	from: string;
	subject: string;
	numAttachments: number;
}

interface ReceivedEmailContent {
	from: string;
	subject: string;
	text: string | null;
	html: string | null;
}

interface ResendAttachmentSummary {
	id: string;
	filename?: string | null;
	content_type: string;
	download_url: string;
	size: number;
}

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function getResendClient() {
	const resendApiKey = process.env.RESEND_API_KEY;
	if (!resendApiKey) {
		throw createError({
			message: "Resend API key not configured",
			status: 500,
			why: "RESEND_API_KEY is required to fetch inbound email content and attachments.",
			fix: "Set RESEND_API_KEY in the deployment environment.",
		});
	}

	return new Resend(resendApiKey);
}

function getResendWebhookSecret() {
	const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
	if (!webhookSecret) {
		throw createError({
			message: "Resend webhook secret not configured",
			status: 500,
			why: "RESEND_WEBHOOK_SECRET is required to verify incoming Resend webhook signatures.",
			fix: "Set RESEND_WEBHOOK_SECRET in the deployment environment.",
		});
	}

	return webhookSecret;
}

function isPdfAttachment(
	filename: string | null | undefined,
	contentType: string,
) {
	if (contentType === "application/pdf") {
		return true;
	}

	return filename?.toLowerCase().endsWith(".pdf") ?? false;
}

function getResendWebhookHeaders(request: Request) {
	const id = request.headers.get("svix-id");
	const timestamp = request.headers.get("svix-timestamp");
	const signature = request.headers.get("svix-signature");

	if (!id || !timestamp || !signature) {
		throw createError({
			message: "Missing Resend webhook signature headers",
			status: 401,
			why: "One or more svix signature headers were missing from the webhook request.",
			fix: "Ensure the request is sent directly by Resend and the svix headers are preserved by any proxy.",
		});
	}

	return { id, timestamp, signature };
}

function getResendErrorMessage(error: { message: string } | null) {
	return error?.message ?? "Unknown Resend API error";
}

function toResendWebhookVerificationError(error: unknown) {
	if (error instanceof EvlogError) {
		return error;
	}

	const message = error instanceof Error ? error.message : String(error);

	return createError({
		message: "Invalid Resend webhook signature",
		status: 401,
		why: message,
		fix: "Ensure the request uses the raw body, the correct Resend webhook secret, and the original svix signature headers.",
	});
}

function shouldSendErrorNotification(error: Error) {
	if (!(error instanceof EvlogError)) {
		return true;
	}

	return error.status >= 500;
}

function decodeQuotedPrintableContent(value: string | null | undefined) {
	if (!value) {
		return "";
	}

	return value
		.replace(/=\r?\n/g, "")
		.replaceAll("=3D", "=")
		.replaceAll("&amp;", "&");
}

function extractAglPdfLink(content: ReceivedEmailContent) {
	const normalizedSubject = decodeQuotedPrintableContent(content.subject);
	const aglBillMarkerPattern =
		/\bAGL\b|monthly (?:electricity|gas) bill|download your bill \(pdf\)|bill period \d{1,2} [A-Za-z]{3} \d{4} to \d{1,2} [A-Za-z]{3} \d{4}/i;
	const normalizedHtml = decodeQuotedPrintableContent(content.html);
	const normalizedText = decodeQuotedPrintableContent(content.text);

	if (
		!aglBillMarkerPattern.test(normalizedText) &&
		!aglBillMarkerPattern.test(normalizedHtml) &&
		!aglBillMarkerPattern.test(normalizedSubject)
	) {
		return null;
	}

	const htmlLinkMatch = normalizedHtml.match(
		/href=["'](https?:\/\/(?:www\.)?agl\.com\.au\/ebillredirect\.aspx\?token=viewbill&payload=[^"']+)["']/i,
	);
	if (htmlLinkMatch?.[1]) {
		return htmlLinkMatch[1];
	}

	const textLinkMatch = normalizedText.match(
		/https?:\/\/(?:www\.)?agl\.com\.au\/ebillredirect\.aspx\?token=viewbill&payload=[A-Za-z0-9+/=_\s-]+/i,
	);
	if (textLinkMatch?.[0]) {
		return textLinkMatch[0].replaceAll(/\s+/g, "");
	}

	return null;
}

function isHudsonMcHughEmail(content: ReceivedEmailContent) {
	const normalizedSubject = decodeQuotedPrintableContent(content.subject);
	const normalizedHtml = decodeQuotedPrintableContent(content.html);
	const normalizedText = decodeQuotedPrintableContent(content.text);
	const hudsonMcHughMarkerPattern =
		/hudson\s*mchugh|statement of outstanding items|tenancy reference|invoice\s+#\s+due\s+description/i;

	return (
		hudsonMcHughMarkerPattern.test(content.from) ||
		hudsonMcHughMarkerPattern.test(normalizedSubject) ||
		hudsonMcHughMarkerPattern.test(normalizedHtml) ||
		hudsonMcHughMarkerPattern.test(normalizedText)
	);
}

function selectPdfAttachmentsForEmail(
	attachments: ResendAttachmentSummary[],
	emailContent: ReceivedEmailContent,
) {
	const pdfAttachments = attachments.filter((attachment) =>
		isPdfAttachment(attachment.filename, attachment.content_type),
	);

	if (!isHudsonMcHughEmail(emailContent)) {
		return pdfAttachments;
	}

	const numberedInvoiceAttachments = pdfAttachments.filter((attachment) =>
		attachment.filename
			? /^Invoice_\d+\.pdf$/i.test(attachment.filename.trim())
			: false,
	);

	return numberedInvoiceAttachments.length > 0
		? numberedInvoiceAttachments
		: pdfAttachments;
}

function looksLikePdf(buffer: Buffer, contentType: string | null) {
	if (contentType?.toLowerCase().includes("application/pdf")) {
		return true;
	}

	return buffer.subarray(0, 4).toString("utf8") === "%PDF";
}

async function downloadBuffer(
	url: string,
): Promise<{ buffer: Buffer; contentType: string | null }> {
	const response = await fetch(url, {
		redirect: "follow",
		headers: {
			"User-Agent": "sharehouse-bills-webhook/1.0",
			Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
		},
	});

	if (!response.ok) {
		throw new Error(
			`Unexpected response downloading PDF: ${response.status} ${response.statusText}`.trim(),
		);
	}

	return {
		buffer: Buffer.from(await response.arrayBuffer()),
		contentType: response.headers.get("content-type"),
	};
}

async function downloadAglPdfAttachment(content: ReceivedEmailContent) {
	const aglPdfLink = extractAglPdfLink(content);
	if (!aglPdfLink) {
		return null;
	}

	const { buffer, contentType } = await downloadBuffer(aglPdfLink);
	if (!looksLikePdf(buffer, contentType)) {
		throw createError({
			message: "AGL bill link did not return a PDF",
			status: 502,
			why: `The AGL link resolved to content-type ${contentType ?? "unknown"} instead of a PDF.`,
			fix: "Check the AGL email format and confirm the bill download link still points directly to a PDF.",
		});
	}

	return {
		filename: `${content.subject || "agl-bill"}.pdf`
			.replaceAll(/[^A-Za-z0-9._-]/g, "-")
			.replace(/-+/g, "-"),
		buffer,
		size: buffer.byteLength,
		contentType: "application/pdf",
	} satisfies FileAttachment;
}

async function extractResendWebhookPayload(
	request: Request,
): Promise<EmailReceivedEvent | null> {
	const resend = getResendClient();
	let event: ReturnType<typeof resend.webhooks.verify>;
	try {
		event = resend.webhooks.verify({
			payload: await request.text(),
			headers: getResendWebhookHeaders(request),
			webhookSecret: getResendWebhookSecret(),
		});
	} catch (error) {
		throw toResendWebhookVerificationError(error);
	}

	if (event.type !== "email.received") {
		return null;
	}

	return event;
}

async function extractResendPdfAttachments(event: EmailReceivedEvent) {
	const resend = getResendClient();
	const emailResponse = await resend.emails.receiving.get(event.data.email_id);
	if (emailResponse.error || !emailResponse.data) {
		throw createError({
			message: "Failed to fetch Resend email content",
			status: 502,
			why: getResendErrorMessage(emailResponse.error),
			fix: "Verify the Resend API key and confirm the inbound email still exists in Resend.",
		});
	}

	const attachmentResponse = await resend.emails.receiving.attachments.list({
		emailId: event.data.email_id,
	});
	if (attachmentResponse.error || !attachmentResponse.data) {
		throw createError({
			message: "Failed to list Resend attachments",
			status: 502,
			why: getResendErrorMessage(attachmentResponse.error),
			fix: "Verify the Resend API key and confirm attachment retrieval is enabled for this inbox.",
		});
	}

	const emailContent = {
		from: emailResponse.data.from,
		subject: emailResponse.data.subject,
		text: emailResponse.data.text,
		html: emailResponse.data.html,
	} satisfies ReceivedEmailContent;

	const selectedPdfAttachments = selectPdfAttachmentsForEmail(
		attachmentResponse.data.data,
		emailContent,
	);

	const pdfAttachments = await Promise.all(
		selectedPdfAttachments.map(async (attachment) => {
			const response = await fetch(attachment.download_url);
			if (!response.ok) {
				throw createError({
					message: "Failed to download Resend attachment",
					status: 502,
					why: `Attachment ${attachment.filename ?? attachment.id} returned ${response.status} ${response.statusText}.`,
					fix: "Retry the webhook after verifying Resend attachment download URLs are still valid.",
				});
			}

			return {
				filename: attachment.filename ?? `${attachment.id}.pdf`,
				buffer: Buffer.from(await response.arrayBuffer()),
				size: attachment.size,
				contentType: attachment.content_type,
			} satisfies FileAttachment;
		}),
	);
	const aglLinkedPdfAttachment =
		pdfAttachments.length === 0
			? await downloadAglPdfAttachment(emailContent)
			: null;
	const attachments = aglLinkedPdfAttachment
		? [...pdfAttachments, aglLinkedPdfAttachment]
		: pdfAttachments;

	return {
		attachments,
		emailMetadata: {
			from: emailContent.from,
			subject: emailContent.subject,
			numAttachments:
				attachmentResponse.data.data.length + (aglLinkedPdfAttachment ? 1 : 0),
		} satisfies EmailMetadata,
	};
}

async function sendWebhookResultNotification(
	results: ProcessingResult[],
	emailMetadata: EmailMetadata,
	log?: RequestLogger,
) {
	try {
		const emailNotifier = new EmailNotifierService();
		await emailNotifier.sendWebhookResult(results, emailMetadata);
	} catch (error) {
		log?.warn("Failed to send webhook result notification", {
			email: emailMetadata,
			notification: {
				type: "webhook_result",
			},
		});
		log?.error(error instanceof Error ? error : String(error));
	}
}

async function sendErrorNotification(
	error: Error,
	emailMetadata: EmailMetadata,
	log?: RequestLogger,
) {
	try {
		const emailNotifier = new EmailNotifierService();
		await emailNotifier.sendErrorNotification(error, emailMetadata);
	} catch (notificationError) {
		log?.warn("Failed to send error notification", {
			email: emailMetadata,
			notification: {
				type: "error_notification",
			},
		});
		log?.error(
			notificationError instanceof Error
				? notificationError
				: String(notificationError),
		);
	}
}

async function processPdfAttachments(
	attachments: FileAttachment[],
	emailMetadata: EmailMetadata,
	log?: RequestLogger,
) {
	if (attachments.length === 0) {
		log?.info("No PDF attachments found in email webhook", {
			email: emailMetadata,
		});
		return jsonResponse({
			success: true,
			message: "No PDF attachments to process",
		});
	}

	log?.set({
		email: emailMetadata,
		attachments: {
			pdfCount: attachments.length,
		},
	});

	const { BillProcessorService } = await import(
		"../api/services/bill-processor"
	);
	const billProcessor = new BillProcessorService();
	const results = await billProcessor.processEmailAttachments(
		attachments,
		emailMetadata.from,
		emailMetadata.subject,
	);

	const successCount = results.filter((result) => result.success).length;
	const errorCount = results.length - successCount;

	log?.set({
		processing: {
			totalAttachments: attachments.length,
			successCount,
			errorCount,
		},
	});
	log?.info("Processed email PDF attachments", {
		processing: {
			totalAttachments: attachments.length,
			successCount,
			errorCount,
		},
	});

	await sendWebhookResultNotification(results, emailMetadata, log);

	return jsonResponse({
		success: true,
		message: `Processed ${attachments.length} PDF attachments: ${successCount} successful, ${errorCount} failed`,
		results: results.map((result) => ({
			filename: result.filename,
			success: result.success,
			status: result.status,
			billId: result.billId,
			duplicateOfBillId: result.duplicateOfBillId,
			error: result.error,
			parsedData: result.parsedData,
		})),
	});
}

async function handleResendRequest(request: Request, log?: RequestLogger) {
	const event = await extractResendWebhookPayload(request);
	if (!event) {
		log?.info("Ignoring non-email.received Resend webhook event");
		return {
			emailMetadata: {
				from: "",
				subject: "",
				numAttachments: 0,
			} satisfies EmailMetadata,
			response: jsonResponse({
				success: true,
				message: "Ignored non-email.received webhook event",
			}),
		};
	}
	log?.set({
		webhook: {
			provider: "resend",
			eventType: event.type,
			emailId: event.data.email_id,
		},
	});

	const { attachments, emailMetadata } =
		await extractResendPdfAttachments(event);
	return {
		emailMetadata,
		response: await processPdfAttachments(attachments, emailMetadata, log),
	};
}

export const Route = createFileRoute("/api/hooks/email")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const log = getRequestLogger();
				let emailMetadata: EmailMetadata = {
					from: "",
					subject: "",
					numAttachments: 0,
				};
				setApiRequestContext(log, request, {
					operation: "email_webhook",
				});
				log?.set({
					webhook: {
						provider: "resend",
						contentType:
							request.headers.get("content-type")?.toLowerCase() ?? "",
					},
				});

				try {
					const result = await handleResendRequest(request, log);

					emailMetadata = result.emailMetadata;
					log?.set({
						email: emailMetadata,
					});
					setApiResponseContext(
						log,
						{
							contentType: result.response.headers.get("content-type"),
						},
						{
							email: {
								...emailMetadata,
								processed: result.response.ok,
							},
						},
					);

					return result.response;
				} catch (error) {
					const wrappedError =
						error instanceof Error ? error : new Error(String(error));
					log?.error(wrappedError, {
						email: emailMetadata,
						webhook: {
							provider: "resend",
						},
					});

					if (shouldSendErrorNotification(wrappedError)) {
						await sendErrorNotification(wrappedError, emailMetadata, log);
					}

					if (wrappedError instanceof EvlogError) {
						throw wrappedError;
					}

					throw createError({
						message: "Email webhook processing failed",
						status: 500,
						why: wrappedError.message,
						fix: "Inspect the webhook payload, Resend configuration, and PDF processing pipeline.",
					});
				}
			},
		},
	},
});
