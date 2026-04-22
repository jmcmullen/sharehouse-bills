import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { BillProcessorService } from "../api/services/bill-processor";
import { authMiddleware } from "../lib/auth-middleware";

export const uploadBillPdf = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			filename: z.string().min(1),
			contentType: z.string().min(1),
			size: z.number().nonnegative(),
			dataBase64: z.string().min(1),
		}),
	)
	.handler(async ({ data }) => {
		const billProcessor = new BillProcessorService();

		return await billProcessor.processEmailAttachments(
			[
				{
					filename: data.filename,
					contentType: data.contentType,
					size: data.size,
					buffer: Buffer.from(data.dataBase64, "base64"),
				},
			],
			"manual@upload.com",
			"Manual Bill Upload",
		);
	});
