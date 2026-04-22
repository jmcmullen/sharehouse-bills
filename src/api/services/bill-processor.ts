import { eq, or } from "drizzle-orm";
import { createError } from "evlog";
import {
	getDefaultBillReminderConfig,
	toBillReminderDbValues,
} from "../../lib/bill-reminder-config";
import { getRequestLogger } from "../../lib/request-logger";
import { db } from "../db";
import { bills } from "../db/schema/bills";
import { debts } from "../db/schema/debts";
import { housemates } from "../db/schema/housemates";
import { BillPdfStorageService } from "./bill-pdf-storage";
import { applyHousemateCreditToDebt } from "./debt-payment-state";
import {
	type ExtractedBillData,
	PdfBillExtractorService,
} from "./pdf-bill-extractor";
import { enqueueBillCreatedNotification } from "./whatsapp-notification-events";

export interface FileAttachment {
	filename: string;
	contentType: string;
	buffer: Buffer;
	size: number;
}

export interface ProcessingResult {
	success: boolean;
	status: "processed" | "duplicate" | "failed";
	billId?: string;
	duplicateOfBillId?: string;
	filename: string;
	error?: string;
	parsedData?: ExtractedBillData;
}

export class BillProcessorService {
	private billExtractor: PdfBillExtractorService;
	private billPdfStorage: BillPdfStorageService;

	constructor() {
		this.billExtractor = new PdfBillExtractorService();
		this.billPdfStorage = new BillPdfStorageService();
	}

	async processEmailAttachments(
		attachments: FileAttachment[],
		emailFrom: string,
		emailSubject: string,
	): Promise<ProcessingResult[]> {
		const log = getRequestLogger();
		log?.set({
			email: {
				from: emailFrom,
				subject: emailSubject,
			},
			attachmentBatch: {
				totalAttachments: attachments.length,
			},
		});

		const results: ProcessingResult[] = [];

		for (const pdf of attachments) {
			try {
				const attachmentResults = await this.processPdfAttachment(
					pdf,
					emailFrom,
					emailSubject,
				);
				results.push(...attachmentResults);
			} catch (error) {
				log?.error(error instanceof Error ? error : String(error), {
					attachmentFailures: [
						{
							filename: pdf.filename,
							size: pdf.size,
						},
					],
				});
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				results.push({
					success: false,
					status: "failed",
					filename: pdf.filename,
					error: errorMessage,
				});
			}
		}

		log?.set({
			attachmentBatch: {
				totalAttachments: attachments.length,
				processedResults: results.length,
				successCount: results.filter((result) => result.success).length,
				errorCount: results.filter((result) => !result.success).length,
			},
		});

		return results;
	}

	async processPdfAttachment(
		attachment: FileAttachment,
		emailFrom: string,
		emailSubject: string,
	): Promise<ProcessingResult[]> {
		const log = getRequestLogger();
		try {
			log?.set({
				attachments: [
					{
						filename: attachment.filename,
						contentType: attachment.contentType,
						size: attachment.size,
					},
				],
			});

			const parsedBills = await this.billExtractor.extractBillsFromPdf(
				attachment.buffer,
				attachment.filename,
				attachment.contentType,
			);
			let pdfUrl: string | null = null;
			const pdfSha256 = parsedBills[0]?.pdfSha256;

			if (pdfSha256) {
				pdfUrl = await this.billPdfStorage.savePdf(
					pdfSha256,
					attachment.buffer,
				);
			}

			const results: ProcessingResult[] = [];
			for (const parsedData of parsedBills) {
				try {
					const duplicateBill = await this.findDuplicateBill(
						parsedData,
						parsedBills.length === 1,
					);

					if (duplicateBill) {
						if (pdfUrl && !duplicateBill.pdfUrl) {
							await db
								.update(bills)
								.set({
									pdfUrl,
									updatedAt: new Date(),
								})
								.where(eq(bills.id, duplicateBill.id));
						}

						results.push({
							success: true,
							status: "duplicate",
							filename: this.buildResultFilename(
								attachment.filename,
								parsedData,
							),
							billId: duplicateBill.id,
							duplicateOfBillId: duplicateBill.id,
							error: `Duplicate bill already imported as bill ${duplicateBill.id}`,
						});
						continue;
					}

					const [newBill] = await db
						.insert(bills)
						.values({
							billerName: parsedData.billerName,
							provider: parsedData.provider,
							billType: parsedData.billType,
							totalAmount: parsedData.totalAmount,
							dueDate: parsedData.dueDate,
							statementDate: parsedData.statementDate,
							chargeDueDate: parsedData.chargeDueDate,
							billPeriodStart: parsedData.billPeriodStart,
							billPeriodEnd: parsedData.billPeriodEnd,
							accountNumber: parsedData.accountNumber,
							referenceNumber: parsedData.referenceNumber,
							sourceFilename: parsedData.sourceFilename,
							parseMethod: parsedData.parseMethod,
							parseConfidence: parsedData.parseConfidence,
							sourceFingerprint: parsedData.sourceFingerprint,
							pdfSha256: parsedData.pdfSha256,
							pdfUrl,
							...toBillReminderDbValues(
								getDefaultBillReminderConfig({
									billerName: parsedData.billerName,
									billType: parsedData.billType,
									templateName: parsedData.sourceFilename,
								}),
							),
						})
						.returning();
					log?.set({
						processedBills: [
							{
								billId: newBill.id,
								billerName: parsedData.billerName,
								totalAmount: parsedData.totalAmount,
								referenceNumber: parsedData.referenceNumber,
							},
						],
					});

					const activeHousemates = await db
						.select()
						.from(housemates)
						.where(eq(housemates.isActive, true));

					if (activeHousemates.length === 0) {
						throw createError({
							message: "No active housemates found to assign bill to",
							status: 500,
							why: "The bill processor could not find any active housemates for debt assignment.",
							fix: "Add or reactivate at least one housemate before importing bills.",
						});
					}

					const nonOwnerHousemates = activeHousemates.filter(
						(housemate) => !housemate.isOwner,
					);
					if (nonOwnerHousemates.length === 0) {
						throw createError({
							message: "No active non-owner housemates found to assign bill to",
							status: 500,
							why: "The bill processor only creates debts for non-owner housemates, but none are active.",
							fix: "Mark at least one active housemate as a non-owner before importing bills.",
						});
					}

					const amountPerPerson =
						parsedData.totalAmount / nonOwnerHousemates.length;
					const debtRecords = nonOwnerHousemates.map((housemate) => ({
						billId: newBill.id,
						housemateId: housemate.id,
						amountOwed: amountPerPerson,
						amountPaid: 0,
					}));

					const insertedDebts = await db
						.insert(debts)
						.values(debtRecords)
						.returning({
							id: debts.id,
							housemateId: debts.housemateId,
						});
					for (const debtRecord of insertedDebts) {
						await applyHousemateCreditToDebt(
							debtRecord.housemateId,
							debtRecord.id,
						);
					}
					log?.set({
						debtCreation: {
							billId: newBill.id,
							debtRecordCount: debtRecords.length,
							amountPerPerson,
						},
					});
					await enqueueBillCreatedNotification(newBill.id, "email_import");

					results.push({
						success: true,
						billId: newBill.id,
						filename: this.buildResultFilename(attachment.filename, parsedData),
						status: "processed",
						parsedData,
					});
				} catch (error) {
					log?.error(error instanceof Error ? error : String(error), {
						parsedBillFailures: [
							{
								billerName: parsedData.billerName,
								referenceNumber: parsedData.referenceNumber,
								filename: attachment.filename,
							},
						],
					});
					const errorMessage =
						error instanceof Error ? error.message : String(error);

					results.push({
						success: false,
						status: "failed",
						filename: this.buildResultFilename(attachment.filename, parsedData),
						error: errorMessage,
					});
				}
			}

			return results;
		} catch (error) {
			log?.error(error instanceof Error ? error : String(error), {
				email: {
					from: emailFrom,
					subject: emailSubject,
				},
				attachmentFailures: [
					{
						filename: attachment.filename,
					},
				],
			});
			const errorMessage =
				error instanceof Error ? error.message : String(error);

			return [
				{
					success: false,
					status: "failed",
					filename: attachment.filename,
					error: errorMessage,
				},
			];
		}
	}

	async testAIConnection(): Promise<boolean> {
		return this.billExtractor.testAIConnection();
	}

	private buildResultFilename(
		attachmentFilename: string,
		parsedData: ExtractedBillData,
	) {
		if (parsedData.referenceNumber) {
			return `${attachmentFilename} (${parsedData.referenceNumber})`;
		}

		return attachmentFilename;
	}

	private async findDuplicateBill(
		parsedData: ExtractedBillData,
		allowPdfShaFallback: boolean,
	) {
		if (!parsedData.sourceFingerprint && !parsedData.pdfSha256) {
			return null;
		}

		const whereClause = parsedData.sourceFingerprint
			? allowPdfShaFallback && parsedData.pdfSha256
				? or(
						eq(bills.sourceFingerprint, parsedData.sourceFingerprint),
						eq(bills.pdfSha256, parsedData.pdfSha256),
					)
				: eq(bills.sourceFingerprint, parsedData.sourceFingerprint)
			: parsedData.pdfSha256
				? eq(bills.pdfSha256, parsedData.pdfSha256)
				: undefined;

		if (!whereClause) {
			return null;
		}

		const [existingBill] = await db
			.select({
				id: bills.id,
				pdfUrl: bills.pdfUrl,
			})
			.from(bills)
			.where(whereClause)
			.limit(1);

		return existingBill ?? null;
	}
}
