import { createHash } from "node:crypto";
import { PDFParse } from "pdf-parse";
import { AIParserService } from "./ai-parser";

const AGL_BILL_TYPE_REGEX = /Here's your monthly (electricity|gas) bill/i;
const AGL_NEW_CHARGES_REGEX =
	/Total new charges and credits \(including GST\)\s*=\s*\$([\d,]+\.\d{2})/i;
const AGL_ISSUE_DATE_REGEX = /Issue date\s+(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})/i;
const AGL_ACCOUNT_NUMBER_REGEX = /Account number\s+([\d ]{6,})/i;
const AGL_REFERENCE_NUMBER_REGEX = /Reference number\s+([\d ]{10,})/i;
const AGL_CURRENT_CHARGE_DUE_REGEX =
	/\$([\d,]+\.\d{2})\s+are new charges and are due on\s+(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})/i;
const AGL_ACCOUNT_BALANCE_DUE_REGEX =
	/entire account balance will fall due by\s+(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})/i;
const AGL_BILL_PERIOD_REGEX =
	/Bill period:\s+(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\s+to\s+(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})/i;
const HUDSON_MCHUGH_STATEMENT_HEADER_REGEX =
	/Tenancy\s+[–-]\s+Statement of Outstanding Items/i;
const HUDSON_MCHUGH_STATEMENT_SECTION_REGEX =
	/Invoice\s+#\s+Due\s+Description\s+Total Amount Paid\/Credited Outstanding\s+([\s\S]+?)\s+Total Outstanding:/i;
const HUDSON_MCHUGH_STATEMENT_ROW_REGEX =
	/(\d+)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(.+?)\s+\$([\d,]+\.\d{2})\s+\$([\d,]+\.\d{2})\s+\$([\d,]+\.\d{2})(?=\s+\d+\s+\d{1,2}\/\d{1,2}\/\d{4}\s+|\s*$)/g;
const HUDSON_MCHUGH_STATEMENT_DATE_REGEX =
	/Statement as at\s+\d{1,2}:\d{2}\s+[AP]M\s+(\d{1,2}\/\d{1,2}\/\d{4})/i;
const HUDSON_MCHUGH_ISSUED_ON_REGEX = /Issued On:\s+(\d{1,2}\/\d{1,2}\/\d{4})/i;
const HUDSON_MCHUGH_TENANCY_REFERENCE_REGEX = /Tenancy Reference.*?:\s*(\d+)/i;
const HUDSON_MCHUGH_PROPERTY_REGEX =
	/Property:\s+(.+?)(?:\s+Item\s+#|\s+--\s+\d+\s+of\s+\d+\s+--|$)/i;

export interface ExtractedBillData {
	billerName: string;
	provider?: string;
	billType?: "electricity" | "gas" | "internet" | "phone" | "water" | "other";
	totalAmount: number;
	dueDate: Date;
	statementDate?: Date;
	chargeDueDate?: Date;
	billPeriodStart?: Date;
	billPeriodEnd?: Date;
	accountNumber?: string;
	referenceNumber?: string;
	parseMethod: "agl_regex" | "hudson_mchugh_regex" | "ai";
	parseConfidence: number;
	pdfSha256: string;
	sourceFingerprint: string;
	sourceFilename: string;
}

interface ExtractedPdfText {
	text: string;
	pdfSha256: string;
}

export class DuplicateBillError extends Error {
	existingBillId?: number;

	constructor(message: string, existingBillId?: number) {
		super(message);
		this.name = "DuplicateBillError";
		this.existingBillId = existingBillId;
	}
}

export class UnsupportedBillFormatError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UnsupportedBillFormatError";
	}
}

export class PdfBillExtractorService {
	private aiParser: AIParserService;

	constructor() {
		this.aiParser = new AIParserService();
	}

	async extractBillsFromPdf(
		pdfBuffer: Buffer,
		filename: string,
		mimeType = "application/pdf",
	): Promise<ExtractedBillData[]> {
		const extractedPdf = await this.extractPdfText(pdfBuffer);
		const aglBill = this.parseAglBill(
			extractedPdf.text,
			filename,
			extractedPdf.pdfSha256,
		);
		if (aglBill) {
			return [aglBill];
		}

		const hudsonMcHughBills = this.parseHudsonMcHughBills(
			extractedPdf.text,
			filename,
			extractedPdf.pdfSha256,
		);
		if (hudsonMcHughBills) {
			return hudsonMcHughBills;
		}

		const aiBill = await this.aiParser.parsePdfFromBuffer(
			pdfBuffer,
			filename,
			mimeType,
		);
		const dueDate = new Date(aiBill.dueDate);

		return [
			{
				billerName: aiBill.billerName,
				provider: undefined,
				billType: aiBill.billType ?? "other",
				totalAmount: aiBill.totalAmount,
				dueDate,
				statementDate: undefined,
				chargeDueDate: dueDate,
				billPeriodStart: undefined,
				billPeriodEnd: undefined,
				accountNumber: this.normalizeNumericString(aiBill.accountNumber),
				referenceNumber: this.normalizeNumericString(aiBill.referenceNumber),
				parseMethod: "ai",
				parseConfidence: 0.5,
				pdfSha256: extractedPdf.pdfSha256,
				sourceFingerprint: this.buildFingerprint([
					"ai",
					aiBill.billerName,
					String(aiBill.totalAmount),
					dueDate.toISOString(),
					this.normalizeNumericString(aiBill.accountNumber) ?? "",
					this.normalizeNumericString(aiBill.referenceNumber) ?? "",
				]),
				sourceFilename: filename,
			},
		];
	}

	async testAIConnection(): Promise<boolean> {
		return this.aiParser.testConnection();
	}

	private async extractPdfText(pdfBuffer: Buffer): Promise<ExtractedPdfText> {
		const parser = new PDFParse({ data: pdfBuffer });

		try {
			const result = await parser.getText();
			const text = this.normalizeWhitespace(result.text);

			if (!text) {
				throw new UnsupportedBillFormatError(
					"Unable to extract text from PDF attachment",
				);
			}

			return {
				text,
				pdfSha256: createHash("sha256").update(pdfBuffer).digest("hex"),
			};
		} finally {
			await parser.destroy();
		}
	}

	private parseAglBill(
		text: string,
		filename: string,
		pdfSha256: string,
	): ExtractedBillData | null {
		const billTypeMatch = text.match(AGL_BILL_TYPE_REGEX);
		if (!billTypeMatch) {
			return null;
		}

		const billType = billTypeMatch[1]?.toLowerCase() as
			| "electricity"
			| "gas"
			| undefined;
		const statementDate = this.extractDate(text, AGL_ISSUE_DATE_REGEX);
		const billPeriodMatch = text.match(AGL_BILL_PERIOD_REGEX);
		const billPeriodStart = billPeriodMatch?.[1]
			? this.parseAustralianDate(billPeriodMatch[1])
			: undefined;
		const billPeriodEnd = billPeriodMatch?.[2]
			? this.parseAustralianDate(billPeriodMatch[2])
			: undefined;
		const totalAmount = this.extractMoney(text, AGL_NEW_CHARGES_REGEX);

		if (!statementDate || !billType || !billPeriodStart || !billPeriodEnd) {
			throw new UnsupportedBillFormatError(
				`AGL bill is missing required fields in ${filename}`,
			);
		}

		if (totalAmount === undefined) {
			throw new UnsupportedBillFormatError(
				`AGL bill is missing "Total new charges and credits (including GST)" in ${filename}`,
			);
		}

		const currentChargeDueMatch = text.match(AGL_CURRENT_CHARGE_DUE_REGEX);
		const currentChargeAmount = currentChargeDueMatch?.[1]
			? this.parseMoney(currentChargeDueMatch[1])
			: undefined;
		const chargeDueDate =
			currentChargeAmount === totalAmount && currentChargeDueMatch?.[2]
				? this.parseAustralianDate(currentChargeDueMatch[2])
				: undefined;
		const accountBalanceDueDate = this.extractDate(
			text,
			AGL_ACCOUNT_BALANCE_DUE_REGEX,
		);
		const dueDate = chargeDueDate ?? accountBalanceDueDate ?? statementDate;
		const accountNumber = this.extractNumericString(
			text,
			AGL_ACCOUNT_NUMBER_REGEX,
		);
		const referenceNumber = this.extractNumericString(
			text,
			AGL_REFERENCE_NUMBER_REGEX,
		);

		return {
			billerName: `AGL ${billType[0].toUpperCase()}${billType.slice(1)}`,
			provider: "AGL",
			billType,
			totalAmount,
			dueDate,
			statementDate,
			chargeDueDate,
			billPeriodStart,
			billPeriodEnd,
			accountNumber,
			referenceNumber,
			parseMethod: "agl_regex",
			parseConfidence: chargeDueDate ? 1 : 0.9,
			pdfSha256,
			sourceFingerprint: this.buildFingerprint([
				"agl",
				billType,
				accountNumber ?? "",
				referenceNumber ?? "",
				billPeriodStart.toISOString(),
				billPeriodEnd.toISOString(),
				totalAmount.toFixed(2),
			]),
			sourceFilename: filename,
		};
	}

	private parseHudsonMcHughBills(
		text: string,
		filename: string,
		pdfSha256: string,
	): ExtractedBillData[] | null {
		if (!HUDSON_MCHUGH_STATEMENT_HEADER_REGEX.test(text)) {
			return null;
		}

		const statementSectionMatch = text.match(
			HUDSON_MCHUGH_STATEMENT_SECTION_REGEX,
		);
		const statementSection = statementSectionMatch?.[1];
		if (!statementSection) {
			throw new UnsupportedBillFormatError(
				`Hudson McHugh statement rows not found in ${filename}`,
			);
		}

		const statementDate =
			this.extractSlashDate(text, HUDSON_MCHUGH_STATEMENT_DATE_REGEX) ??
			this.extractSlashDate(text, HUDSON_MCHUGH_ISSUED_ON_REGEX);
		const tenancyReference = this.extractNumericString(
			text,
			HUDSON_MCHUGH_TENANCY_REFERENCE_REGEX,
		);
		const property = this.extractText(text, HUDSON_MCHUGH_PROPERTY_REGEX);
		const bills: ExtractedBillData[] = [];

		for (const match of statementSection.matchAll(
			HUDSON_MCHUGH_STATEMENT_ROW_REGEX,
		)) {
			const referenceNumber = this.normalizeNumericString(match[1]);
			const dueDateValue = match[2];
			const descriptionValue = match[3];
			const totalAmountValue = match[4];
			const paidAmountValue = match[5];
			const outstandingAmountValue = match[6];

			if (
				!referenceNumber ||
				!dueDateValue ||
				!descriptionValue ||
				!totalAmountValue ||
				!paidAmountValue ||
				!outstandingAmountValue
			) {
				continue;
			}

			const dueDate = this.parseSlashDate(dueDateValue);
			const outstandingAmount = this.parseMoney(outstandingAmountValue);
			const description =
				this.normalizeHudsonMcHughDescription(descriptionValue);

			if (outstandingAmount <= 0) {
				continue;
			}

			bills.push({
				billerName: `Hudson McHugh - ${description}`,
				provider: "Hudson McHugh",
				billType: "other",
				totalAmount: outstandingAmount,
				dueDate,
				statementDate,
				chargeDueDate: dueDate,
				billPeriodStart: undefined,
				billPeriodEnd: undefined,
				accountNumber: tenancyReference,
				referenceNumber,
				parseMethod: "hudson_mchugh_regex",
				parseConfidence: 1,
				pdfSha256,
				sourceFingerprint: this.buildFingerprint([
					"hudson_mchugh",
					tenancyReference ?? "",
					referenceNumber,
					description,
					property ?? "",
					outstandingAmount.toFixed(2),
					dueDate.toISOString(),
				]),
				sourceFilename: filename,
			});
		}

		if (bills.length === 0) {
			throw new UnsupportedBillFormatError(
				`Hudson McHugh statement contained no outstanding rows in ${filename}`,
			);
		}

		return bills;
	}

	private extractMoney(text: string, pattern: RegExp): number | undefined {
		const match = text.match(pattern);
		return match?.[1] ? this.parseMoney(match[1]) : undefined;
	}

	private extractDate(text: string, pattern: RegExp): Date | undefined {
		const match = text.match(pattern);
		return match?.[1] ? this.parseAustralianDate(match[1]) : undefined;
	}

	private extractSlashDate(text: string, pattern: RegExp): Date | undefined {
		const match = text.match(pattern);
		return match?.[1] ? this.parseSlashDate(match[1]) : undefined;
	}

	private extractNumericString(
		text: string,
		pattern: RegExp,
	): string | undefined {
		const match = text.match(pattern);
		return this.normalizeNumericString(match?.[1]);
	}

	private extractText(text: string, pattern: RegExp): string | undefined {
		const match = text.match(pattern);
		return match?.[1] ? this.normalizeWhitespace(match[1]) : undefined;
	}

	private parseMoney(value: string): number {
		return Number.parseFloat(value.replaceAll(",", ""));
	}

	private parseAustralianDate(value: string): Date {
		const match = value.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
		if (!match) {
			throw new UnsupportedBillFormatError(`Invalid date: ${value}`);
		}

		const [, dayValue, monthValue, yearValue] = match;
		const monthIndex = this.getMonthIndex(monthValue);
		const parsedDate = new Date(
			Date.UTC(
				Number.parseInt(yearValue, 10),
				monthIndex,
				Number.parseInt(dayValue, 10),
			),
		);

		if (Number.isNaN(parsedDate.getTime())) {
			throw new UnsupportedBillFormatError(`Invalid date: ${value}`);
		}

		return parsedDate;
	}

	private parseSlashDate(value: string): Date {
		const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
		if (!match) {
			throw new UnsupportedBillFormatError(`Invalid date: ${value}`);
		}

		const [, dayValue, monthValue, yearValue] = match;
		const parsedDate = new Date(
			Date.UTC(
				Number.parseInt(yearValue, 10),
				Number.parseInt(monthValue, 10) - 1,
				Number.parseInt(dayValue, 10),
			),
		);

		if (Number.isNaN(parsedDate.getTime())) {
			throw new UnsupportedBillFormatError(`Invalid date: ${value}`);
		}

		return parsedDate;
	}

	private normalizeNumericString(value?: string | null): string | undefined {
		if (!value) {
			return undefined;
		}

		const normalized = value.replace(/\s+/g, " ").trim();
		return normalized.length > 0 ? normalized : undefined;
	}

	private normalizeWhitespace(value: string): string {
		return value.replace(/\s+/g, " ").trim();
	}

	private normalizeHudsonMcHughDescription(value: string): string {
		return this.normalizeWhitespace(value)
			.replace(/^\$[\d,]+\.\d{2}\s*-\s*/u, "")
			.trim();
	}

	private buildFingerprint(parts: string[]): string {
		return createHash("sha256").update(parts.join("|")).digest("hex");
	}

	private getMonthIndex(month: string): number {
		const monthLookup: Record<string, number> = {
			jan: 0,
			feb: 1,
			mar: 2,
			apr: 3,
			may: 4,
			jun: 5,
			jul: 6,
			aug: 7,
			sep: 8,
			oct: 9,
			nov: 10,
			dec: 11,
		};
		const monthIndex = monthLookup[month.toLowerCase()];
		if (monthIndex === undefined) {
			throw new UnsupportedBillFormatError(`Invalid month: ${month}`);
		}

		return monthIndex;
	}
}
