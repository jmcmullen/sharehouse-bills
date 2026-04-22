import { createFileRoute } from "@tanstack/react-router";
import sharp from "sharp";
import { getPublicHousematePayPageData } from "../api/services/housemate-pay-page";
import {
	buildOgCardSvg,
	formatCurrency,
	formatStackGroupLabel,
	truncate,
} from "../lib/share-preview";

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
			GET: async ({ params }) => {
				const payPage = await getPublicHousematePayPageData(params.token);
				if (!payPage) {
					return new Response("Payment page not found", {
						status: 404,
					});
				}

				const svg = buildOgCardSvg({
					backgroundColor: "#1f221b",
					titleColor: "#f4f7ef",
					secondaryColor: "#c7d1be",
					title: truncate(
						formatPayTitle({
							housemateName: payPage.housemate.name,
							scope: payPage.scope,
						}),
						42,
					),
					primaryValue: formatCurrency(payPage.paymentProgress.remainingAmount),
					tertiaryValue: `${payPage.summary.billCount} unpaid ${payPage.summary.billCount === 1 ? "bill" : "bills"}`,
				});

				const png = await sharp(Buffer.from(svg)).png().toBuffer();

				return new Response(png, {
					headers: {
						"Content-Type": "image/png",
						"Cache-Control": "public, max-age=300",
					},
				});
			},
		},
	},
});
