import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { createFileRoute } from "@tanstack/react-router";
import { EvlogError, type RequestLogger, createError } from "evlog";
import { type EmailReceivedEvent, Resend } from "resend";
import {
	BillProcessorService,
	type FileAttachment,
	type ProcessingResult,
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

async function extractMultipartPdfAttachments(formData: FormData) {
	const pdfAttachments: FileAttachment[] = [];
	const numAttachments =
		Number.parseInt(String(formData.get("attachments") ?? "0"), 10) || 0;

	for (let index = 1; index <= numAttachments; index++) {
		const attachment = formData.get(`attachment${index}`);
		if (!(attachment instanceof File)) {
			continue;
		}

		if (!isPdfAttachment(attachment.name, attachment.type)) {
			continue;
		}

		const buffer = Buffer.from(await attachment.arrayBuffer());
		pdfAttachments.push({
			filename: attachment.name,
			buffer,
			size: attachment.size,
			contentType: attachment.type,
		});
	}

	return pdfAttachments;
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
	const normalizedBodies = [
		decodeQuotedPrintableContent(content.text),
		decodeQuotedPrintableContent(content.html),
	];
	const normalizedSubject = decodeQuotedPrintableContent(content.subject);
	const aglPdfLinkPattern =
		/https?:\/\/(?:www\.)?agl\.com\.au\/ebillredirect\.aspx\?[^"'\\s<]*token=viewbill[^"'\\s<]*/i;
	const aglBillMarkerPattern =
		/\bAGL\b|monthly (?:electricity|gas) bill|download your bill \(pdf\)|bill period \d{1,2} [A-Za-z]{3} \d{4} to \d{1,2} [A-Za-z]{3} \d{4}/i;

	for (const body of normalizedBodies) {
		const match = body.match(aglPdfLinkPattern);
		if (!match?.[0]) {
			continue;
		}

		if (
			aglBillMarkerPattern.test(body) ||
			aglBillMarkerPattern.test(normalizedSubject)
		) {
			return match[0];
		}
	}

	return null;
}

function looksLikePdf(buffer: Buffer, contentType: string | null) {
	if (contentType?.toLowerCase().includes("application/pdf")) {
		return true;
	}

	return buffer.subarray(0, 4).toString("utf8") === "%PDF";
}

async function downloadBuffer(
	url: string,
	redirectsRemaining = 5,
): Promise<{ buffer: Buffer; contentType: string | null }> {
	return await new Promise((resolve, reject) => {
		const targetUrl = new URL(url);
		const requestImpl =
			targetUrl.protocol === "https:" ? httpsRequest : httpRequest;
		const request = requestImpl(
			targetUrl,
			{
				headers: {
					"User-Agent": "sharehouse-bills-webhook/1.0",
					Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
				},
			},
			(response) => {
				const statusCode = response.statusCode ?? 0;
				const location = response.headers.location;

				if (
					statusCode >= 300 &&
					statusCode < 400 &&
					location &&
					redirectsRemaining > 0
				) {
					response.resume();
					const nextUrl = new URL(location, targetUrl).toString();
					void downloadBuffer(nextUrl, redirectsRemaining - 1)
						.then(resolve)
						.catch(reject);
					return;
				}

				if (statusCode < 200 || statusCode >= 300) {
					response.resume();
					reject(
						new Error(
							`Unexpected response downloading PDF: ${statusCode} ${response.statusMessage ?? ""}`.trim(),
						),
					);
					return;
				}

				const chunks: Buffer[] = [];
				response.on("data", (chunk: Buffer | string) => {
					chunks.push(
						typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk),
					);
				});
				response.on("end", () => {
					resolve({
						buffer: Buffer.concat(chunks),
						contentType:
							typeof response.headers["content-type"] === "string"
								? response.headers["content-type"]
								: null,
					});
				});
			},
		);

		request.on("error", reject);
		request.end();
	});
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
	const event = resend.webhooks.verify({
		payload: await request.text(),
		headers: getResendWebhookHeaders(request),
		webhookSecret: getResendWebhookSecret(),
	});

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

	const pdfAttachments = await Promise.all(
		attachmentResponse.data.data
			.filter((attachment) =>
				isPdfAttachment(attachment.filename, attachment.content_type),
			)
			.map(async (attachment) => {
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

async function handleMultipartRequest(request: Request, log?: RequestLogger) {
	const formData = await request.formData();
	const emailMetadata = {
		from: String(formData.get("from") ?? ""),
		subject: String(formData.get("subject") ?? ""),
		numAttachments:
			Number.parseInt(String(formData.get("attachments") ?? "0"), 10) || 0,
	} satisfies EmailMetadata;
	log?.set({
		email: emailMetadata,
		webhook: {
			provider: "email-webhook",
			format: "multipart",
		},
	});

	if (!emailMetadata.from || !emailMetadata.subject) {
		throw createError({
			message: "Missing required fields",
			status: 400,
			why: "The multipart webhook payload did not include both from and subject fields.",
			fix: "Ensure the sender includes from and subject fields when posting multipart email webhooks.",
		});
	}

	if (emailMetadata.numAttachments === 0) {
		log?.info("Ignoring multipart email with no attachments", {
			email: emailMetadata,
		});
		return {
			emailMetadata,
			response: jsonResponse({
				success: true,
				message: "No attachments to process",
			}),
		};
	}

	const attachments = await extractMultipartPdfAttachments(formData);
	return {
		emailMetadata,
		response: await processPdfAttachments(attachments, emailMetadata, log),
	};
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

export const Route = createFileRoute("/api/email-webhook")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const log = getRequestLogger();
				let emailMetadata: EmailMetadata = {
					from: "",
					subject: "",
					numAttachments: 0,
				};
				const contentType = request.headers.get("content-type")?.toLowerCase();
				setApiRequestContext(log, request, {
					operation: "email_webhook",
				});
				log?.set({
					webhook: {
						provider: "email-webhook",
						contentType: contentType ?? "",
					},
				});

				try {
					const result = contentType?.startsWith("multipart/form-data")
						? await handleMultipartRequest(request, log)
						: await handleResendRequest(request, log);

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
							provider: "email-webhook",
						},
					});

					await sendErrorNotification(wrappedError, emailMetadata, log);

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
