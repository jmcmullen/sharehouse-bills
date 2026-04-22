import { createFileRoute } from "@tanstack/react-router";
import sharp from "sharp";
import { getPublicBillPageData } from "../api/services/public-bill-page";
import { buildOgCardSvg, formatCurrency, truncate } from "../lib/share-preview";

export const Route = createFileRoute("/api/cards/$pdfSha256")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const bill = await getPublicBillPageData(params.pdfSha256);
				if (!bill) {
					return new Response("Bill not found", {
						status: 404,
					});
				}

				const svg = buildOgCardSvg({
					backgroundColor: "#2a2824",
					titleColor: "#e8e3d6",
					secondaryColor: "#b8b0a0",
					tertiaryColor: "#938b7d",
					title: truncate(bill.bill.billerName, 40),
					primaryValue:
						bill.shareSummary.hasEvenShares &&
						bill.shareSummary.amountEach !== null
							? `${formatCurrency(bill.shareSummary.amountEach)} each`
							: formatCurrency(bill.bill.totalAmount),
					secondaryValue:
						bill.shareSummary.hasEvenShares &&
						bill.shareSummary.amountEach !== null
							? `Total ${formatCurrency(bill.bill.totalAmount)}`
							: null,
					tertiaryValue:
						!bill.shareSummary.hasEvenShares &&
						bill.shareSummary.participantCount > 0
							? `Split across ${bill.shareSummary.participantCount} ${bill.shareSummary.participantCount === 1 ? "housemate" : "housemates"}`
							: null,
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
