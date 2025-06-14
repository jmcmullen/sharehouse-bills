import sgMail from "@sendgrid/mail";
import type { ProcessingResult } from "./bill-processor";

export class EmailNotifierService {
	private emailTo: string;
	private emailFrom: string;

	constructor() {
		const sendGridApiKey = process.env.SENDGRID_API_KEY;
		if (!sendGridApiKey) {
			throw new Error("SENDGRID_API_KEY environment variable is required");
		}

		const emailTo = process.env.WEBHOOK_EMAIL_TO;
		if (!emailTo) {
			throw new Error("WEBHOOK_EMAIL_TO environment variable is required");
		}
		this.emailTo = emailTo;

		const emailFrom = process.env.WEBHOOK_EMAIL_FROM;
		if (!emailFrom) {
			throw new Error("WEBHOOK_EMAIL_FROM environment variable is required");
		}
		this.emailFrom = emailFrom;

		sgMail.setApiKey(sendGridApiKey);
	}

	async sendWebhookResult(
		results: ProcessingResult[],
		emailMetadata: {
			from: string;
			subject: string;
			numAttachments: number;
		},
	) {
		const successCount = results.filter((r) => r.success).length;
		const errorCount = results.filter((r) => !r.success).length;

		const isSuccess = errorCount === 0;
		const subject = `Email Webhook ${isSuccess ? "Success" : "Failed"} - ${successCount} processed, ${errorCount} failed`;

		// Build detailed results
		let resultDetails = "";
		for (const result of results) {
			resultDetails += `\n📄 ${result.filename}:\n`;
			if (result.success) {
				resultDetails += "   ✅ Successfully processed\n";
				resultDetails += `   📋 Bill ID: ${result.billId}\n`;
				if (result.parsedData) {
					resultDetails += `   💰 Amount: ${result.parsedData.totalAmount}\n`;
					resultDetails += `   🏢 Biller: ${result.parsedData.billerName}\n`;
					resultDetails += `   📅 Due Date: ${result.parsedData.dueDate}\n`;
				}
			} else {
				resultDetails += "   ❌ Failed to process\n";
				resultDetails += `   🚨 Error: ${result.error}\n`;
			}
		}

		const htmlContent = `
			<h2>Email Webhook Processing ${isSuccess ? "Complete" : "Failed"}</h2>
			
			<h3>📊 Summary</h3>
			<ul>
				<li><strong>Total attachments processed:</strong> ${results.length}</li>
				<li><strong>✅ Successful:</strong> ${successCount}</li>
				<li><strong>❌ Failed:</strong> ${errorCount}</li>
			</ul>

			<h3>📧 Original Email</h3>
			<ul>
				<li><strong>From:</strong> ${emailMetadata.from}</li>
				<li><strong>Subject:</strong> ${emailMetadata.subject}</li>
				<li><strong>Attachments:</strong> ${emailMetadata.numAttachments}</li>
			</ul>

			<h3>📋 Detailed Results</h3>
			<pre style="background: #f5f5f5; padding: 10px; border-radius: 5px;">${resultDetails}</pre>

			${
				!isSuccess
					? `
			<h3>🔧 Next Steps</h3>
			<p>Some attachments failed to process. Please check the error details above and consider:</p>
			<ul>
				<li>Verifying the PDF format and quality</li>
				<li>Checking if the bill format is supported</li>
				<li>Manually processing failed bills through the admin panel</li>
			</ul>
			`
					: ""
			}
		`;

		const textContent = `
Email Webhook Processing ${isSuccess ? "Complete" : "Failed"}

Summary:
- Total attachments processed: ${results.length}
- Successful: ${successCount}
- Failed: ${errorCount}

Original Email:
- From: ${emailMetadata.from}
- Subject: ${emailMetadata.subject}
- Attachments: ${emailMetadata.numAttachments}

Detailed Results:${resultDetails}

${
	!isSuccess
		? `
Next Steps:
Some attachments failed to process. Please check the error details above and consider:
- Verifying the PDF format and quality
- Checking if the bill format is supported
- Manually processing failed bills through the admin panel
`
		: ""
}
		`;

		const msg = {
			to: this.emailTo,
			from: this.emailFrom,
			subject,
			text: textContent,
			html: htmlContent,
		};

		try {
			await sgMail.send(msg);
			console.log(`Email notification sent successfully to ${this.emailTo}`);
		} catch (error) {
			console.error("Failed to send email notification:", error);
			// Don't throw here as we don't want email failures to break the webhook
		}
	}

	async sendErrorNotification(
		error: Error,
		emailMetadata?: {
			from?: string;
			subject?: string;
			numAttachments?: number;
		},
	) {
		const subject = "Email Webhook Error - Processing Failed";

		const htmlContent = `
			<h2>🚨 Email Webhook Error</h2>
			
			<h3>❌ Error Details</h3>
			<div style="background: #ffebee; padding: 10px; border-radius: 5px; border-left: 4px solid #f44336;">
				<strong>Error:</strong> ${error.message}<br>
				<strong>Stack:</strong><br>
				<pre style="font-size: 12px; overflow-x: auto;">${error.stack}</pre>
			</div>

			${
				emailMetadata
					? `
			<h3>📧 Email Context</h3>
			<ul>
				<li><strong>From:</strong> ${emailMetadata.from || "Unknown"}</li>
				<li><strong>Subject:</strong> ${emailMetadata.subject || "Unknown"}</li>
				<li><strong>Attachments:</strong> ${emailMetadata.numAttachments || "Unknown"}</li>
			</ul>
			`
					: ""
			}

			<h3>🔧 Next Steps</h3>
			<p>The email webhook encountered a critical error. Please investigate and consider:</p>
			<ul>
				<li>Checking the webhook logs for more details</li>
				<li>Verifying all environment variables are properly set</li>
				<li>Testing the webhook with a sample email</li>
				<li>Checking database connectivity and API quotas</li>
			</ul>
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

Next Steps:
The email webhook encountered a critical error. Please investigate and consider:
- Checking the webhook logs for more details
- Verifying all environment variables are properly set
- Testing the webhook with a sample email
- Checking database connectivity and API quotas
		`;

		const msg = {
			to: this.emailTo,
			from: this.emailFrom,
			subject,
			text: textContent,
			html: htmlContent,
		};

		try {
			await sgMail.send(msg);
			console.log(`Error notification sent successfully to ${this.emailTo}`);
		} catch (emailError) {
			console.error("Failed to send error notification:", emailError);
			// Don't throw here as we don't want email failures to break the webhook further
		}
	}
}
