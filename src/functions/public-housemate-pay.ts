import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getPublicHousematePayPageData } from "../api/services/housemate-pay-page";

function serializePayItem<
	T extends {
		dueDate: Date;
		billPeriodStart: Date | null;
		billPeriodEnd: Date | null;
	},
>(item: T) {
	return {
		...item,
		dueDateIso: item.dueDate.toISOString(),
		billPeriodStartIso: item.billPeriodStart?.toISOString() ?? null,
		billPeriodEndIso: item.billPeriodEnd?.toISOString() ?? null,
	};
}

export const getPublicHousematePay = createServerFn({ method: "GET" })
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
		const page = await getPublicHousematePayPageData(data.token);
		if (!page) {
			return null;
		}

		return {
			...page,
			items: page.items.map(serializePayItem),
			utilityGroups: page.utilityGroups.map((group) => ({
				...group,
				items: group.items.map(serializePayItem),
			})),
			nonUtilityItems: page.nonUtilityItems.map(serializePayItem),
			previewDate: data.previewDate ?? null,
			payId: process.env.PAY_ID?.trim() || null,
		};
	});
