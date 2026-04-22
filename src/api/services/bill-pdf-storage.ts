import { get, put } from "@vercel/blob";

function getBlobReadWriteToken(): string {
	const token = process.env.BLOB_READ_WRITE_TOKEN;

	if (!token) {
		throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
	}

	return token;
}

export class BillPdfStorageService {
	static getViewerUrl(pdfSha256: string): string {
		return `/api/bill-pdfs/${pdfSha256}`;
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
