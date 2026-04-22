import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getPublicBillPageData } from "../api/services/public-bill-page.server";

export const getPublicBillByPdfSha = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			pdfSha256: z.string().min(1),
			previewDate: z
				.string()
				.regex(/^[0-9a-z]{1,10}$/i)
				.optional(),
		}),
	)
	.handler(async ({ data }) => {
		const bill = await getPublicBillPageData(data.pdfSha256);
		if (!bill) {
			return null;
		}

		return {
			...bill,
			bill: {
				...bill.bill,
				dueDateIso: bill.bill.dueDate.toISOString(),
				billPeriodStartIso: bill.bill.billPeriodStart?.toISOString() ?? null,
				billPeriodEndIso: bill.bill.billPeriodEnd?.toISOString() ?? null,
			},
			previewDate: data.previewDate ?? null,
			payId: process.env.PAY_ID?.trim() || null,
		};
	});
