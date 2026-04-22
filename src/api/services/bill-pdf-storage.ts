import { get, put } from "@vercel/blob";

function getBlobReadWriteToken(): string {
	const token = process.env.BLOB_READ_WRITE_TOKEN;

	if (!token) {
		throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
	}

	return token;
}

export class BillPdfStorageService {
	static normalizeMessageCacheDate(value: string | null | undefined) {
		if (!value) {
			return null;
		}

		const trimmedValue = value.trim();
		return /^[0-9a-z]{1,10}$/i.test(trimmedValue)
			? trimmedValue.toLowerCase()
			: null;
	}

	static getMessageCacheDate(date: Date = new Date()) {
		return Math.floor(date.getTime() / 1000).toString(36);
	}

	static appendMessageCacheDate(
		path: string,
		previewDate?: string | null,
	): string {
		const normalizedPreviewDate =
			BillPdfStorageService.normalizeMessageCacheDate(previewDate);
		if (!normalizedPreviewDate) {
			return path;
		}

		const separator = path.includes("?") ? "&" : "?";
		return `${path}${separator}d=${normalizedPreviewDate}`;
	}

	static getViewerUrl(
		billReference: string | number,
		previewDate?: string | null,
	): string {
		return BillPdfStorageService.appendMessageCacheDate(
			`/bill/${billReference}`,
			previewDate,
		);
	}

	static getHousematePayUrl(
		token: string,
		previewDate?: string | null,
	): string {
		return BillPdfStorageService.appendMessageCacheDate(
			`/pay/${token}`,
			previewDate,
		);
	}

	static getDebtReceiptUrl(token: string, previewDate?: string | null): string {
		return BillPdfStorageService.appendMessageCacheDate(
			`/receipt/${token}`,
			previewDate,
		);
	}

	static getPdfUrl(pdfSha256: string): string {
		return `/api/pdfs/${pdfSha256}`;
	}

	static getOgImageUrl(
		billReference: string | number,
		previewDate?: string | null,
	): string {
		return BillPdfStorageService.appendMessageCacheDate(
			`/api/cards/${billReference}`,
			previewDate,
		);
	}

	static getPayOgImageUrl(token: string, previewDate?: string | null): string {
		return BillPdfStorageService.appendMessageCacheDate(
			`/api/cards/pay/${token}`,
			previewDate,
		);
	}

	static getDebtReceiptOgImageUrl(
		token: string,
		previewDate?: string | null,
	): string {
		return BillPdfStorageService.appendMessageCacheDate(
			`/api/cards/receipt/${token}`,
			previewDate,
		);
	}

	static getAbsoluteAppUrl(path: string): string | null {
		const baseUrl = process.env.VITE_BASE_URL?.trim().replace(/\/+$/, "");
		if (!baseUrl) {
			return null;
		}

		return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
	}

	static getAbsoluteViewerUrl(
		billReference: string | number,
		previewDate?: string | null,
	) {
		return BillPdfStorageService.getAbsoluteAppUrl(
			BillPdfStorageService.getViewerUrl(billReference, previewDate),
		);
	}

	static getAbsoluteHousematePayUrl(
		token: string,
		previewDate?: string | null,
	) {
		return BillPdfStorageService.getAbsoluteAppUrl(
			BillPdfStorageService.getHousematePayUrl(token, previewDate),
		);
	}

	static getAbsoluteDebtReceiptUrl(token: string, previewDate?: string | null) {
		return BillPdfStorageService.getAbsoluteAppUrl(
			BillPdfStorageService.getDebtReceiptUrl(token, previewDate),
		);
	}

	private getBlobPath(pdfSha256: string): string {
		return `bills/${pdfSha256}.pdf`;
	}

	async savePdf(pdfSha256: string, pdfBuffer: Buffer): Promise<string> {
		const blob = await put(this.getBlobPath(pdfSha256), pdfBuffer, {
			access: "private",
			allowOverwrite: true,
			contentType: "application/pdf",
			token: getBlobReadWriteToken(),
		});

		return blob.url;
	}

	async getPdf(blobUrl: string) {
		return get(blobUrl, {
			access: "private",
			token: getBlobReadWriteToken(),
			useCache: false,
		});
	}
}
