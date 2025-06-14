import { createServerFileRoute } from "@tanstack/react-start/server";
import { BillProcessorService } from "../../../../packages/api/src/services/bill-processor";

export const ServerRoute = createServerFileRoute("/api/email-webhook").methods({
	POST: async ({ request }) => {
		try {
			console.log("Email webhook received");

			// Parse the multipart form data
			const formData = await request.formData();

			// Extract email metadata
			const from = formData.get("from") as string;
			const subject = formData.get("subject") as string;
			const numAttachments =
				Number.parseInt(formData.get("attachments") as string) || 0;

			console.log("Email from:", from);
			console.log("Subject:", subject);
			console.log("Number of attachments:", numAttachments);

			if (!from || !subject) {
				return new Response(
					JSON.stringify({
						success: false,
						error: "Missing required fields: from, subject",
					}),
					{
						status: 400,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			if (numAttachments === 0) {
				console.log("No attachments found, ignoring email");
				return new Response(
					JSON.stringify({
						success: true,
						message: "No attachments to process",
					}),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			// Extract PDF attachments
			const pdfAttachments = [];
			for (let i = 1; i <= numAttachments; i++) {
				const attachment = formData.get(`attachment${i}`) as File;
				if (attachment) {
					// Check if it's a PDF
					if (
						attachment.type === "application/pdf" ||
						attachment.name.toLowerCase().endsWith(".pdf")
					) {
						// Convert File to Buffer
						const arrayBuffer = await attachment.arrayBuffer();
						const buffer = Buffer.from(arrayBuffer);

						pdfAttachments.push({
							filename: attachment.name,
							buffer: buffer,
							size: attachment.size,
							contentType: attachment.type,
						});
					}
				}
			}

			if (pdfAttachments.length === 0) {
				console.log("No PDF attachments found, ignoring email");
				return new Response(
					JSON.stringify({
						success: true,
						message: "No PDF attachments to process",
					}),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			console.log(`Found ${pdfAttachments.length} PDF attachments`);

			// Process PDF attachments using the bill processor service
			const billProcessor = new BillProcessorService();
			const results = await billProcessor.processEmailAttachments(
				pdfAttachments,
				from,
				subject,
			);

			const successCount = results.filter((r) => r.success).length;
			const errorCount = results.filter((r) => !r.success).length;

			console.log(
				`Processing complete: ${successCount} successful, ${errorCount} failed`,
			);

			return new Response(
				JSON.stringify({
					success: true,
					message: `Processed ${pdfAttachments.length} PDF attachments: ${successCount} successful, ${errorCount} failed`,
					results: results.map((r) => ({
						filename: r.filename,
						success: r.success,
						billId: r.billId,
						error: r.error,
						parsedData: r.parsedData,
					})),
				}),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			);
		} catch (error) {
			console.error("Email webhook error:", error);
			const errorMessage =
				error instanceof Error ? error.message : String(error);

			return new Response(
				JSON.stringify({
					success: false,
					error: errorMessage,
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
	},
});
