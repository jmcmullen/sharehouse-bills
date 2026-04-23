import { createFileRoute } from "@tanstack/react-router";
import { getPublicHousematePayPageData } from "../api/services/housemate-pay-page.server";
import { OgCard } from "../lib/og-card";
import { loadGoogleFonts, resolveFontSetup } from "../lib/og-fonts.server";
import { createOgRouteHandler } from "../lib/og-route.server";
import {
	formatCurrency,
	formatStackGroupLabel,
	truncate,
} from "../lib/share-preview";

const payCardFontSetupPromise = resolveFontSetup({
	baseFonts: loadGoogleFonts({
		family: "Plus Jakarta Sans",
		weights: [500, 600, 700, 800],
	}),
});

function formatPayTitle(input: {
	housemateName: string;
	scope: {
		kind: "all" | "stack";
		stackGroup: string | null;
	};
}) {
	if (input.scope.kind === "stack" && input.scope.stackGroup) {
		return `${input.housemateName}'s ${formatStackGroupLabel(input.scope.stackGroup).toLowerCase()}`;
	}

	return `Bills for ${input.housemateName}`;
}

export const Route = createFileRoute("/api/cards/pay/$token")({
	server: {
		handlers: {
			GET: async ({ params, request }) => {
				const payPage = await getPublicHousematePayPageData(params.token);
				if (!payPage) {
					return new Response("Payment page not found", {
						status: 404,
					});
				}

				const fontSetup = await payCardFontSetupPromise;

				const getOg = createOgRouteHandler({
					baseFonts: fontSetup.fonts,
					component: (
						<OgCard
							backgroundColor="#1f221b"
							fontFamily={fontSetup.families.base}
							primaryValue={formatCurrency(
								payPage.paymentProgress.remainingAmount,
							)}
							secondaryColor="#c7d1be"
							tertiaryValue={`${payPage.summary.billCount} unpaid ${payPage.summary.billCount === 1 ? "bill" : "bills"}`}
							title={truncate(
								formatPayTitle({
									housemateName: payPage.housemate.name,
									scope: payPage.scope,
								}),
								42,
							)}
							titleColor="#f4f7ef"
						/>
					),
				});

				return await getOg({ params, request });
			},
		},
	},
});
