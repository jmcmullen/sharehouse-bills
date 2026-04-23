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

function getFirstName(fullName: string) {
	const trimmed = fullName.trim();
	const first = trimmed.split(/\s+/)[0];
	return first || trimmed || "you";
}

const payCardFontSetupPromise = resolveFontSetup({
	baseFonts: loadGoogleFonts({
		family: "Plus Jakarta Sans",
		weights: [500, 600, 700, 800],
	}),
});

function formatPayTitle(input: {
	housemateName: string;
	scope: {
		kind: "all" | "stack" | "bills";
		stackGroup: string | null;
	};
}) {
	if (input.scope.kind === "stack" && input.scope.stackGroup) {
		return `${input.housemateName}'s ${formatStackGroupLabel(input.scope.stackGroup).toLowerCase()}`;
	}

	if (input.scope.kind === "bills") {
		return `${input.housemateName}'s reminder bills`;
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
				const isAllSorted = payPage.summary.billCount === 0;

				const cardProps = isAllSorted
					? {
							backgroundColor: "#0d1f14",
							primaryValue: "All sorted 🎉",
							secondaryColor: "#b9e4c9",
							secondaryValue: `Thanks, ${getFirstName(payPage.housemate.name)}`,
							tertiaryValue:
								payPage.recentlySettled.billCount > 0
									? `${formatCurrency(payPage.recentlySettled.amount)} paid across ${payPage.recentlySettled.billCount} ${payPage.recentlySettled.billCount === 1 ? "bill" : "bills"} recently`
									: "You're all caught up",
							title: truncate(
								formatPayTitle({
									housemateName: payPage.housemate.name,
									scope: payPage.scope,
								}),
								42,
							),
							titleColor: "#f0fbf4",
						}
					: {
							backgroundColor: "#1f221b",
							primaryValue: formatCurrency(
								payPage.paymentProgress.remainingAmount,
							),
							secondaryColor: "#c7d1be",
							tertiaryValue: `${payPage.summary.billCount} unpaid ${payPage.summary.billCount === 1 ? "bill" : "bills"}`,
							title: truncate(
								formatPayTitle({
									housemateName: payPage.housemate.name,
									scope: payPage.scope,
								}),
								42,
							),
							titleColor: "#f4f7ef",
						};

				const getOg = createOgRouteHandler({
					baseFonts: fontSetup.fonts,
					component: (
						<OgCard {...cardProps} fontFamily={fontSetup.families.base} />
					),
				});

				return await getOg({ params, request });
			},
		},
	},
});
