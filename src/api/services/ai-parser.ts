import { createVertex } from "@ai-sdk/google-vertex";
import { generateText } from "ai";
import { z } from "zod";

// Schema for parsed bill data
export const parsedBillSchema = z.object({
	billerName: z.string().min(1),
	totalAmount: z.number().positive(),
	dueDate: z.string().datetime(),
	billType: z.string().nullable().optional(),
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
			private_key: process.env.GOOGLE_PRIVATE_KEY,
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
		try {
			console.log(`Parsing PDF: ${filename}`);

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
- Use the exact company name as it appears on the bill
- Convert dates to ISO 8601 format (e.g., "2024-01-15T00:00:00.000Z")
- If due date is not found or unclear, use null and it will default to today's date
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

			console.log("AI Response:", text);

			// Parse the JSON response
			let parsedData: unknown;
			try {
				// Clean the response to extract JSON
				const jsonMatch = text.match(/\{[\s\S]*\}/);
				if (!jsonMatch) {
					throw new Error("No JSON found in AI response");
				}

				parsedData = JSON.parse(jsonMatch[0]);
			} catch (parseError) {
				console.error("Failed to parse AI response as JSON:", text);
				const errorMessage =
					parseError instanceof Error ? parseError.message : String(parseError);
				throw new Error(`Invalid JSON response from AI: ${errorMessage}`);
			}

			// Convert dueDate to Date object and cast to expected format
			const dataToValidate = parsedData as Record<string, unknown>;

			// Handle due date - default to today if null or invalid
			if (!dataToValidate.dueDate || dataToValidate.dueDate === null) {
				// Default to today's date if due date not found
				dataToValidate.dueDate = new Date().toISOString();
				console.log("Due date not found in PDF, defaulting to today's date");
			} else if (typeof dataToValidate.dueDate === "string") {
				try {
					dataToValidate.dueDate = new Date(
						dataToValidate.dueDate,
					).toISOString();
				} catch (dateError) {
					// If date parsing fails, default to today
					dataToValidate.dueDate = new Date().toISOString();
					console.log(
						"Failed to parse due date from PDF, defaulting to today's date",
					);
				}
			} else {
				// If due date is not a string, default to today
				dataToValidate.dueDate = new Date().toISOString();
				console.log("Due date format invalid, defaulting to today's date");
			}

			// Convert null values to empty strings for optional fields
			if (dataToValidate.billType === null) dataToValidate.billType = undefined;
			if (dataToValidate.accountNumber === null)
				dataToValidate.accountNumber = undefined;
			if (dataToValidate.referenceNumber === null)
				dataToValidate.referenceNumber = undefined;

			// Validate the parsed data
			const validatedData = parsedBillSchema.parse(dataToValidate);

			console.log("Successfully parsed bill:", validatedData);
			return validatedData;
		} catch (error) {
			console.error("Error parsing PDF:", error);
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			throw new Error(`Failed to parse PDF: ${errorMessage}`);
		}
	}

	async testConnection(): Promise<boolean> {
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

			return text.trim().toLowerCase().includes("ok");
		} catch (error) {
			console.error("AI connection test failed:", error);
			return false;
		}
	}
}
