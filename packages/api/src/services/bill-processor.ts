import { eq } from "drizzle-orm";
import { db } from "../db";
import { bills } from "../db/schema/bills";
import { debts } from "../db/schema/debts";
import { housemates } from "../db/schema/housemates";
import { unreconciledTransactions } from "../db/schema/unreconciledTransactions";
import { AIParserService, type ParsedBill } from "./ai-parser";

export interface FileAttachment {
	filename: string;
	contentType: string;
	buffer: Buffer;
	size: number;
}

export interface ProcessingResult {
	success: boolean;
	billId?: number;
	filename: string;
	error?: string;
	parsedData?: ParsedBill;
}

export class BillProcessorService {
	private aiParser: AIParserService;

	constructor() {
		this.aiParser = new AIParserService();
	}

	async processEmailAttachments(
		attachments: FileAttachment[],
		emailFrom: string,
		emailSubject: string,
	): Promise<ProcessingResult[]> {
		const results: ProcessingResult[] = [];

		for (const pdf of attachments) {
			try {
				const result = await this.processPdfAttachment(
					pdf,
					emailFrom,
					emailSubject,
				);
				results.push(result);
			} catch (error) {
				console.error(`Failed to process ${pdf.filename}:`, error);
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				results.push({
					success: false,
					filename: pdf.filename,
					error: errorMessage,
				});
			}
		}

		return results;
	}

	async processPdfAttachment(
		attachment: FileAttachment,
		emailFrom: string,
		emailSubject: string,
	): Promise<ProcessingResult> {
		try {
			console.log(`Processing PDF attachment: ${attachment.filename}`);

			// Parse the PDF using AI
			const parsedData = await this.aiParser.parsePdfFromBuffer(
				attachment.buffer,
				attachment.filename,
				attachment.contentType,
			);

			// Create the bill in the database
			const [newBill] = await db
				.insert(bills)
				.values({
					billerName: parsedData.billerName,
					totalAmount: parsedData.totalAmount,
					dueDate: new Date(parsedData.dueDate),
					pdfUrl: null, // Could store the PDF content or URL if needed
				})
				.returning();

			console.log(`Created bill with ID: ${newBill.id}`);

			// Get all active housemates
			const activeHousemates = await db
				.select()
				.from(housemates)
				.where(eq(housemates.isActive, true));

			if (activeHousemates.length === 0) {
				throw new Error("No active housemates found to assign bill to");
			}

			// Split the bill equally among ALL active housemates
			const amountPerPerson = parsedData.totalAmount / activeHousemates.length;

			// Create debt records only for non-owner housemates
			const debtRecords = activeHousemates
				.filter((housemate) => !housemate.isOwner) // Exclude owners from owing money
				.map((housemate) => ({
					billId: newBill.id,
					housemateId: housemate.id,
					amountOwed: amountPerPerson,
				}));

			await db.insert(debts).values(debtRecords);

			console.log(
				`Created ${debtRecords.length} debt records for bill ${newBill.id}`,
			);

			return {
				success: true,
				billId: newBill.id,
				filename: attachment.filename,
				parsedData,
			};
		} catch (error) {
			console.error(`Error processing PDF ${attachment.filename}:`, error);
			const errorMessage =
				error instanceof Error ? error.message : String(error);

			// Log the failed processing attempt
			// Note: For now we just log to console, but this could be enhanced
			// to store failed processing attempts in a dedicated table
			console.log("Failed email processing:", {
				emailFrom,
				emailSubject,
				filename: attachment.filename,
				error: errorMessage,
				timestamp: new Date().toISOString(),
			});

			return {
				success: false,
				filename: attachment.filename,
				error: errorMessage,
			};
		}
	}

	async testAIConnection(): Promise<boolean> {
		return this.aiParser.testConnection();
	}
}
