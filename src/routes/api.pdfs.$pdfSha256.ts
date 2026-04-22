import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import type { RequestLogger } from "evlog";
import { db } from "../api/db";
import { bills } from "../api/db/schema/bills";
import { BillPdfStorageService } from "../api/services/bill-pdf-storage";
import { setApiRequestContext, setApiResponseContext } from "../lib/api-log";
import { getRequestLogger } from "../lib/request-logger";

function toSafePdfFilename(
	filename: string | null,
	billerName: string,
): string {
	const baseName = filename?.trim() || `${billerName}.pdf`;

	if (baseName.toLowerCase().endsWith(".pdf")) {
		return baseName.replaceAll(/[^A-Za-z0-9._-]/g, "-");
	}

	return `${baseName.replaceAll(/[^A-Za-z0-9._-]/g, "-")}.pdf`;
}

export const Route = createFileRoute("/api/pdfs/$pdfSha256")({
	server: {
		handlers: {
			GET: async ({ params, request }) => {
				const log = getRequestLogger() as RequestLogger | undefined;
				setApiRequestContext(log, request, {
					operation: "bill_pdf_fetch",
					pdf: {
						sha256: params.pdfSha256,
					},
				});

				const [bill] = await db
					.select({
						billerName: bills.billerName,
						pdfUrl: bills.pdfUrl,
						sourceFilename: bills.sourceFilename,
						pdfSha256: bills.pdfSha256,
					})
					.from(bills)
					.where(eq(bills.pdfSha256, params.pdfSha256))
					.limit(1);

				if (!bill?.pdfSha256 || !bill.pdfUrl) {
					setApiResponseContext(
						log,
						{
							contentType: "text/plain",
						},
						{
							pdf: {
								found: false,
							},
						},
					);
					return new Response("PDF not found", { status: 404 });
				}

				const pdfResult = await new BillPdfStorageService().getPdf(bill.pdfUrl);

				if (!pdfResult || pdfResult.statusCode !== 200) {
					setApiResponseContext(
						log,
						{
							contentType: "text/plain",
						},
						{
							pdf: {
								found: false,
								storage: "blob",
							},
						},
					);
					return new Response("PDF file not found", { status: 404 });
				}
				setApiResponseContext(
					log,
					{
						contentType: pdfResult.blob.contentType || "application/pdf",
						streamed: true,
					},
					{
						auth: {
							authorized: true,
							mode: "public_sha",
						},
						pdf: {
							filename: toSafePdfFilename(bill.sourceFilename, bill.billerName),
							size: pdfResult.blob.size,
						},
					},
				);

				return new Response(pdfResult.stream, {
					headers: {
						"Content-Disposition": `inline; filename="${toSafePdfFilename(bill.sourceFilename, bill.billerName)}"`,
						"Content-Length": String(pdfResult.blob.size),
						"Content-Type": pdfResult.blob.contentType || "application/pdf",
						ETag: pdfResult.blob.etag,
						"Cache-Control": "public, max-age=300",
					},
				});
			},
		},
	},
});
