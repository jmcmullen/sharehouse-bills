import { createFileRoute } from "@tanstack/react-router";
import { getPublicDebtReceiptPageData } from "../api/services/debt-receipt-page.server";
import { getReceiptBillLabel } from "../lib/debt-receipt";
import { OgCard } from "../lib/og-card";
import { loadGoogleFonts, resolveFontSetup } from "../lib/og-fonts.server";
import { createOgRouteHandler } from "../lib/og-route.server";
import { formatCurrency, truncate } from "../lib/share-preview";

const receiptCardFontSetupPromise = resolveFontSetup({
	baseFonts: loadGoogleFonts({
		family: "Plus Jakarta Sans",
		weights: [500, 600, 700, 800],
	}),
});

export const Route = createFileRoute("/api/cards/receipt/$token")({
	server: {
		handlers: {
			GET: async ({ params, request }) => {
				const receipt = await getPublicDebtReceiptPageData(params.token);
				if (!receipt) {
					return new Response("Receipt not found", {
						status: 404,
					});
				}

				const billLabel = getReceiptBillLabel(receipt.receipt);
				const fontSetup = await receiptCardFontSetupPromise;

				const getOg = createOgRouteHandler({
					baseFonts: fontSetup.fonts,
					component: (
						<OgCard
							backgroundColor="#1f241d"
							fontFamily={fontSetup.families.base}
							primaryValue={formatCurrency(receipt.receipt.amountPaid)}
							secondaryColor="#bbcfad"
							tertiaryColor="#8fa083"
							tertiaryValue={truncate(billLabel, 42)}
							title={truncate(`${receipt.housemate.name} paid`, 40)}
							titleColor="#edf5e5"
						/>
					),
				});

				return await getOg({ params, request });
			},
		},
	},
});
