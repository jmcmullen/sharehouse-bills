import { createFileRoute } from "@tanstack/react-router";
import { getPublicBillPageData } from "../api/services/public-bill-page.server";
import { OgCard } from "../lib/og-card";
import { loadGoogleFonts, resolveFontSetup } from "../lib/og-fonts.server";
import { createOgRouteHandler } from "../lib/og-route.server";
import { formatCurrency, truncate } from "../lib/share-preview";

const billCardFontSetupPromise = resolveFontSetup({
	baseFonts: loadGoogleFonts({
		family: "Plus Jakarta Sans",
		weights: [500, 600, 700, 800],
	}),
});

function getBillOgTitle(input: {
	billerName: string;
	recurringTemplateName: string | null;
}) {
	const templateName = input.recurringTemplateName?.trim();
	if (!templateName) {
		return input.billerName;
	}

	return input.billerName.toLowerCase().includes(templateName.toLowerCase())
		? input.billerName
		: `${input.billerName} ${templateName}`;
}

export const Route = createFileRoute("/api/cards/$pdfSha256")({
	server: {
		handlers: {
			GET: async ({ params, request }) => {
				const bill = await getPublicBillPageData(params.pdfSha256);
				if (!bill) {
					return new Response("Bill not found", {
						status: 404,
					});
				}

				const fontSetup = await billCardFontSetupPromise;
				const isAllSorted = bill.paymentProgress.percentage === 100;

				const getOg = createOgRouteHandler({
					baseFonts: fontSetup.fonts,
					component: (
						<OgCard
							backgroundColor={isAllSorted ? "#0d1f14" : "#2a2824"}
							fontFamily={fontSetup.families.base}
							primaryValue={
								isAllSorted
									? "Paid in full"
									: bill.shareSummary.hasEvenShares &&
											bill.shareSummary.amountEach !== null
										? `${formatCurrency(bill.shareSummary.amountEach)} each`
										: formatCurrency(bill.bill.totalAmount)
							}
							secondaryColor={isAllSorted ? "#b9e4c9" : "#b8b0a0"}
							secondaryValue={
								isAllSorted
									? "Thanks everyone"
									: bill.shareSummary.hasEvenShares &&
											bill.shareSummary.amountEach !== null
										? `Total ${formatCurrency(bill.bill.totalAmount)}`
										: null
							}
							tertiaryColor={isAllSorted ? "#8fc6a5" : "#938b7d"}
							tertiaryValue={
								isAllSorted
									? "Settled and squared away"
									: !bill.shareSummary.hasEvenShares &&
											bill.shareSummary.participantCount > 0
										? `Split across ${bill.shareSummary.participantCount} ${bill.shareSummary.participantCount === 1 ? "housemate" : "housemates"}`
										: null
							}
							title={truncate(
								getBillOgTitle({
									billerName: bill.bill.billerName,
									recurringTemplateName: bill.bill.recurringTemplateName,
								}),
								40,
							)}
							titleColor={isAllSorted ? "#f0fbf4" : "#e8e3d6"}
						/>
					),
				});

				return await getOg({ params, request });
			},
		},
	},
});
