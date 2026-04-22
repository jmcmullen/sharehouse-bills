import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getPublicDebtReceiptPageData } from "../api/services/debt-receipt-page.server";

export const getPublicDebtReceipt = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			token: z.string().min(1),
			previewDate: z
				.string()
				.regex(/^[0-9a-z]{1,10}$/i)
				.optional(),
		}),
	)
	.handler(async ({ data }) => {
		const receipt = await getPublicDebtReceiptPageData(data.token);
		if (!receipt) {
			return null;
		}

		return {
			...receipt,
			receipt: {
				...receipt.receipt,
				paidAtIso: receipt.receipt.paidAt.toISOString(),
				dueDateIso: receipt.receipt.dueDate.toISOString(),
				billPeriodStartIso:
					receipt.receipt.billPeriodStart?.toISOString() ?? null,
				billPeriodEndIso: receipt.receipt.billPeriodEnd?.toISOString() ?? null,
			},
			previewDate: data.previewDate ?? null,
		};
	});
