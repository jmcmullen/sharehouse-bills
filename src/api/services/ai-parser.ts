import { createVertex } from "@ai-sdk/google-vertex";
import { generateText } from "ai";
import { createError } from "evlog";
import { z } from "zod";
import { getRequestLogger } from "../../lib/request-logger";

// Schema for parsed bill data
export const parsedBillSchema = z.object({
	billerName: z.string().min(1),
	totalAmount: z.number().positive(),
	dueDate: z.string().datetime(),
	billType: z
		.enum(["electricity", "gas", "internet", "phone", "water", "other"])
		.nullable()
		.optional(),
	accountNumber: z.string().nullable().optional(),
	referenceNumber: z.string().nullable().optional(),
});

export type ParsedBill = z.infer<typeof parsedBillSchema>;

// Configure Google Cloud credentials
const vertexConfig: Parameters<typeof createVertex>[0] = {
	project: process.env.GOOGLE_VERTEX_PROJECT,
	location: process.env.GOOGLE_CLOUD_REGION || "us-central1",
};

// For Vercel deployment, use individual credential fields
if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
	vertexConfig.googleAuthOptions = {
		credentials: {
			client_email: process.env.GOOGLE_CLIENT_EMAIL,
			private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
		},
		scopes: ["https://www.googleapis.com/auth/cloud-platform"],
	};
}

const vertex = createVertex(vertexConfig);

export class AIParserService {
	// Vertex AI will use environment variables for authentication
	// GOOGLE_APPLICATION_CREDENTIALS or gcloud auth for local development

	async parsePdfFromBuffer(
		pdfBuffer: Buffer,
		filename: string,
		mimeType = "application/pdf",
	): Promise<ParsedBill> {
		const log = getRequestLogger();
		try {
			log?.set({
				pdfParsing: {
					filename,
					mimeType,
					size: pdfBuffer.byteLength,
					provider: "vertex-ai",
					model: "gemini-1.5-pro",
				},
			});

			const prompt = `
You are an expert at extracting bill information from PDF documents. 
Analyze the provided PDF and extract the following information in JSON format:

{
  "billerName": "Name of the company/organization sending the bill",
  "totalAmount": "Total amount due as a number (e.g., 125.50)",
  "dueDate": "Due date in ISO 8601 format (e.g., 2024-01-15T00:00:00.000Z)",
  "billType": "Type of bill (e.g., electricity, gas, internet, phone)",
  "accountNumber": "Account number if available",
  "referenceNumber": "Reference or invoice number if available"
}

Important guidelines:
- Extract only the total amount due, not partial payments or previous balances
- If the bill separately lists "new charges" or "current charges", extract that amount instead of any account balance
- Use the exact company name as it appears on the bill
- Convert dates to ISO 8601 format (e.g., "2024-01-15T00:00:00.000Z")
- If due date is not found or unclear, use null
- Return only valid JSON, no additional text or explanations
- If information is unclear or missing, use null for optional fields
- For totalAmount, extract only the numeric value without currency symbols
`;

			const { text } = await generateText({
				model: vertex("gemini-1.5-pro"),
				messages: [
					{
						role: "user",
						content: [
							{
								type: "text",
								text: prompt,
							},
							{
								type: "file",
								data: pdfBuffer,
								mimeType,
							},
						],
					},
				],
				maxTokens: 1000,
			});
			log?.set({
				pdfParsing: {
					filename,
					responseLength: text.length,
				},
			});

			// Parse the JSON response
			let parsedData: unknown;
			try {
				// Clean the response to extract JSON
				const jsonMatch = text.match(/\{[\s\S]*\}/);
				if (!jsonMatch) {
					throw createError({
						message: "No JSON found in AI response",
						status: 502,
						why: "The language model returned text that did not contain a JSON object.",
						fix: "Tighten the prompt or inspect the raw model output for schema drift.",
					});
				}

				parsedData = JSON.parse(jsonMatch[0]);
			} catch (parseError) {
				log?.error(
					parseError instanceof Error ? parseError : String(parseError),
					{
						pdfParsing: {
							filename,
							responseLength: text.length,
						},
					},
				);
				const errorMessage =
					parseError instanceof Error ? parseError.message : String(parseError);
				throw createError({
					message: "Invalid JSON response from AI",
					status: 502,
					why: errorMessage,
					fix: "Inspect the model response format and ensure it still matches the expected JSON schema.",
				});
			}

			// Convert dueDate to Date object and cast to expected format
			const dataToValidate = parsedData as Record<string, unknown>;

			// Reject missing or invalid due dates instead of guessing.
			if (!dataToValidate.dueDate || dataToValidate.dueDate === null) {
				throw createError({
					message: "Due date not found in PDF",
					status: 422,
					why: "The extracted bill data did not include a usable due date.",
					fix: "Review the PDF source or adjust the extraction prompt to require the due date field.",
				});
			}

			if (typeof dataToValidate.dueDate === "string") {
				try {
					dataToValidate.dueDate = new Date(
						dataToValidate.dueDate,
					).toISOString();
				} catch {
					throw createError({
						message: "Failed to parse due date from PDF",
						status: 422,
						why: "The extracted due date string could not be converted to ISO format.",
						fix: "Inspect the source date value and normalize its format before validation.",
					});
				}
				// Convert null values to empty strings for optional fields
				if (dataToValidate.billType === null)
					dataToValidate.billType = undefined;
				if (dataToValidate.accountNumber === null)
					dataToValidate.accountNumber = undefined;
				if (dataToValidate.referenceNumber === null)
					dataToValidate.referenceNumber = undefined;

				// Validate the parsed data
				const validatedData = parsedBillSchema.parse(dataToValidate);
				log?.set({
					parsedBill: {
						billerName: validatedData.billerName,
						totalAmount: validatedData.totalAmount,
						dueDate: validatedData.dueDate,
						billType: validatedData.billType,
						accountNumber: validatedData.accountNumber,
						referenceNumber: validatedData.referenceNumber,
					},
				});
				return validatedData;
			}

			throw createError({
				message: "Due date format invalid",
				status: 422,
				why: "The extracted due date was not a string value.",
				fix: "Ensure the parser returns the due date as a valid ISO-compatible string before validation.",
			});
		} catch (error) {
			log?.error(error instanceof Error ? error : String(error), {
				pdfParsing: {
					filename,
				},
			});
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			throw createError({
				message: "Failed to parse PDF",
				status: 500,
				why: errorMessage,
				fix: "Check the PDF contents, parser prompt, and Vertex AI response for extraction issues.",
			});
		}
	}

	async testConnection(): Promise<boolean> {
		const log = getRequestLogger();
		try {
			const { text } = await generateText({
				model: vertex("gemini-2.0-flash-lite-preview-02-05"),
				messages: [
					{
						role: "user",
						content: 'Respond with just the word "OK" to test the connection.',
					},
				],
				maxTokens: 10,
			});

			log?.set({
				vertexAi: {
					connectionTest: text.trim(),
				},
			});
			return text.trim().toLowerCase().includes("ok");
		} catch (error) {
			log?.error(error instanceof Error ? error : String(error), {
				vertexAi: {
					connectionTest: "failed",
				},
			});
			return false;
		}
	}
}
