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

				const getOg = createOgRouteHandler({
					baseFonts: fontSetup.fonts,
					component: (
						<OgCard
							backgroundColor="#2a2824"
							fontFamily={fontSetup.families.base}
							primaryValue={
								bill.shareSummary.hasEvenShares &&
								bill.shareSummary.amountEach !== null
									? `${formatCurrency(bill.shareSummary.amountEach)} each`
									: formatCurrency(bill.bill.totalAmount)
							}
							secondaryColor="#b8b0a0"
							secondaryValue={
								bill.shareSummary.hasEvenShares &&
								bill.shareSummary.amountEach !== null
									? `Total ${formatCurrency(bill.bill.totalAmount)}`
									: null
							}
							tertiaryColor="#938b7d"
							tertiaryValue={
								!bill.shareSummary.hasEvenShares &&
								bill.shareSummary.participantCount > 0
									? `Split across ${bill.shareSummary.participantCount} ${bill.shareSummary.participantCount === 1 ? "housemate" : "housemates"}`
									: null
							}
							title={truncate(bill.bill.billerName, 40)}
							titleColor="#e8e3d6"
						/>
					),
				});

				return await getOg({ params, request });
			},
		},
	},
});
