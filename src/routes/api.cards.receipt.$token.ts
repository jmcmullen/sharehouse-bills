import { createFileRoute } from "@tanstack/react-router";
import sharp from "sharp";
import {
	getPublicDebtReceiptPageData,
	getReceiptBillLabel,
} from "../api/services/debt-receipt-page";
import { buildOgCardSvg, formatCurrency, truncate } from "../lib/share-preview";

export const Route = createFileRoute("/api/cards/receipt/$token")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const receipt = await getPublicDebtReceiptPageData(params.token);
				if (!receipt) {
					return new Response("Receipt not found", {
						status: 404,
					});
				}

				const billLabel = getReceiptBillLabel(receipt.receipt);
				const svg = buildOgCardSvg({
					backgroundColor: "#1f241d",
					titleColor: "#edf5e5",
					secondaryColor: "#bbcfad",
					tertiaryColor: "#8fa083",
					title: truncate(`${receipt.housemate.name} paid`, 40),
					primaryValue: formatCurrency(receipt.receipt.amountPaid),
					tertiaryValue: truncate(billLabel, 42),
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
