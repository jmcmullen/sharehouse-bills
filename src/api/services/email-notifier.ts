import { createError } from "evlog";
import { Resend } from "resend";
import { getRequestLogger } from "../../lib/request-logger";
import type { ProcessingResult } from "./bill-processor";

function getResendClient() {
	const resendApiKey = process.env.RESEND_API_KEY;
	if (!resendApiKey) {
		throw createError({
			message: "RESEND_API_KEY environment variable is required",
			status: 500,
			why: "The email notifier cannot send notifications without a Resend API key.",
			fix: "Set RESEND_API_KEY in the deployment environment.",
		});
	}

	return new Resend(resendApiKey);
}

export class EmailNotifierService {
	private readonly emailTo: string;
	private readonly emailFrom: string;
	private readonly resend: Resend;

	constructor() {
		const emailTo = process.env.WEBHOOK_EMAIL_TO;
		if (!emailTo) {
			throw createError({
				message: "WEBHOOK_EMAIL_TO environment variable is required",
				status: 500,
				why: "The notifier requires a destination email address for webhook summaries.",
				fix: "Set WEBHOOK_EMAIL_TO in the deployment environment.",
			});
		}
		this.emailTo = emailTo;

		const emailFrom = process.env.WEBHOOK_EMAIL_FROM;
		if (!emailFrom) {
			throw createError({
				message: "WEBHOOK_EMAIL_FROM environment variable is required",
				status: 500,
				why: "The notifier requires a sender email address for outbound webhook summaries.",
				fix: "Set WEBHOOK_EMAIL_FROM in the deployment environment.",
			});
		}
		this.emailFrom = emailFrom;

		this.resend = getResendClient();
	}

	async sendWebhookResult(
		results: ProcessingResult[],
		emailMetadata: {
			from: string;
			subject: string;
			numAttachments: number;
		},
	) {
		const log = getRequestLogger();
		const successCount = results.filter((result) => result.success).length;
		const errorCount = results.length - successCount;
		const subject = `Email Webhook ${errorCount === 0 ? "Success" : "Failed"} - ${successCount} processed, ${errorCount} failed`;

		let resultDetails = "";
		for (const result of results) {
			resultDetails += `\n- ${result.filename}\n`;
			if (result.status === "duplicate") {
				resultDetails += "  Status: Duplicate bill skipped\n";
				resultDetails += `  Existing bill ID: ${result.duplicateOfBillId}\n`;
				resultDetails += `  Details: ${result.error}\n`;
				continue;
			}

			if (result.success) {
				resultDetails += "  Status: Successfully processed\n";
				resultDetails += `  Bill ID: ${result.billId}\n`;
				if (result.parsedData) {
					resultDetails += `  Amount: ${result.parsedData.totalAmount}\n`;
					resultDetails += `  Biller: ${result.parsedData.billerName}\n`;
					resultDetails += `  Due date: ${result.parsedData.dueDate}\n`;
				}
				continue;
			}

			resultDetails += "  Status: Failed to process\n";
			resultDetails += `  Error: ${result.error}\n`;
		}

		const htmlContent = `
			<h2>Email Webhook Processing ${errorCount === 0 ? "Complete" : "Failed"}</h2>
			<h3>Summary</h3>
			<ul>
				<li><strong>Total attachments processed:</strong> ${results.length}</li>
				<li><strong>Successful:</strong> ${successCount}</li>
				<li><strong>Failed:</strong> ${errorCount}</li>
			</ul>

			<h3>Original Email</h3>
			<ul>
				<li><strong>From:</strong> ${emailMetadata.from}</li>
				<li><strong>Subject:</strong> ${emailMetadata.subject}</li>
				<li><strong>Attachments:</strong> ${emailMetadata.numAttachments}</li>
			</ul>

			<h3>Detailed Results</h3>
			<pre style="background: #f5f5f5; padding: 10px; border-radius: 5px;">${resultDetails}</pre>
		`;

		const textContent = `
Email Webhook Processing ${errorCount === 0 ? "Complete" : "Failed"}

Summary:
- Total attachments processed: ${results.length}
- Successful: ${successCount}
- Failed: ${errorCount}

Original Email:
- From: ${emailMetadata.from}
- Subject: ${emailMetadata.subject}
- Attachments: ${emailMetadata.numAttachments}

Detailed Results:${resultDetails}
		`;

		const { data, error } = await this.resend.emails.send({
			to: [this.emailTo],
			from: this.emailFrom,
			subject,
			text: textContent,
			html: htmlContent,
		});

		if (error) {
			log?.error(new Error(error.message), {
				notification: {
					type: "webhook_result",
					to: this.emailTo,
				},
			});
			return;
		}

		log?.set({
			notification: {
				type: "webhook_result",
				to: this.emailTo,
				from: this.emailFrom,
				messageId: data?.id,
				successCount,
				errorCount,
			},
		});
	}

	async sendErrorNotification(
		error: Error,
		emailMetadata?: {
			from?: string;
			subject?: string;
			numAttachments?: number;
		},
	) {
		const log = getRequestLogger();
		const subject = "Email Webhook Error - Processing Failed";
		const htmlContent = `
			<h2>Email Webhook Error</h2>
			<h3>Error Details</h3>
			<div style="background: #ffebee; padding: 10px; border-radius: 5px; border-left: 4px solid #f44336;">
				<strong>Error:</strong> ${error.message}<br>
				<strong>Stack:</strong><br>
				<pre style="font-size: 12px; overflow-x: auto;">${error.stack}</pre>
			</div>

			${
				emailMetadata
					? `
			<h3>Email Context</h3>
			<ul>
				<li><strong>From:</strong> ${emailMetadata.from || "Unknown"}</li>
				<li><strong>Subject:</strong> ${emailMetadata.subject || "Unknown"}</li>
				<li><strong>Attachments:</strong> ${emailMetadata.numAttachments || "Unknown"}</li>
			</ul>
			`
					: ""
			}
		`;

		const textContent = `
Email Webhook Error

Error Details:
${error.message}

Stack Trace:
${error.stack}

${
	emailMetadata
		? `
Email Context:
- From: ${emailMetadata.from || "Unknown"}
- Subject: ${emailMetadata.subject || "Unknown"}
- Attachments: ${emailMetadata.numAttachments || "Unknown"}
`
		: ""
}
		`;

		const { data, error: sendError } = await this.resend.emails.send({
			to: [this.emailTo],
			from: this.emailFrom,
			subject,
			text: textContent,
			html: htmlContent,
		});

		if (sendError) {
			log?.error(new Error(sendError.message), {
				notification: {
					type: "error_notification",
					to: this.emailTo,
				},
			});
			return;
		}

		log?.set({
			notification: {
				type: "error_notification",
				to: this.emailTo,
				from: this.emailFrom,
				messageId: data?.id,
			},
		});
	}
}
