import { createFileRoute } from "@tanstack/react-router";
import { getPublicBillPageData } from "../api/services/public-bill-page.server";
import { OgCard } from "../lib/og-card";
import { loadGoogleFonts, resolveFontSetup } from "../lib/og-fonts.server";
import {
	createOgHeadResponse,
	createOgRouteHandler,
} from "../lib/og-route.server";
import { formatReminderBillLabel } from "../lib/reminder-preview";
import {
	type BillPreview,
	buildBillPreview,
	truncate,
} from "../lib/share-preview";

type CardTone = BillPreview["card"]["tone"];

// Background, title, secondary and tertiary colours per preview tone.
const CARD_COLOURS: Record<CardTone, [string, string, string, string]> = {
	paid: ["#0d1f14", "#f0fbf4", "#b9e4c9", "#8fc6a5"],
	overdue: ["#291717", "#fff2f1", "#e0b5b8", "#c99599"],
	today: ["#2b2212", "#fff4d7", "#e7c37d", "#c59b50"],
	soon: ["#2a2824", "#e8e3d6", "#b8b0a0", "#938b7d"],
	later: ["#2a2824", "#e8e3d6", "#b8b0a0", "#938b7d"],
};

const billCardFontSetupPromise = resolveFontSetup({
	baseFonts: loadGoogleFonts({
		family: "Plus Jakarta Sans",
		weights: [500, 600, 700, 800],
	}),
});

function getBillOgCardProps(card: BillPreview["card"]) {
	const [backgroundColor, titleColor, secondaryColor, tertiaryColor] =
		CARD_COLOURS[card.tone];
	return {
		backgroundColor,
		titleColor,
		secondaryColor,
		tertiaryColor,
		primaryValue: card.primary,
		secondaryValue: card.secondary,
		tertiaryValue: card.tertiary,
	};
}

export const Route = createFileRoute("/api/cards/$pdfSha256")({
	server: {
		handlers: {
			HEAD: () => createOgHeadResponse(),
			GET: async ({ params, request }) => {
				const bill = await getPublicBillPageData(params.pdfSha256);
				if (!bill) {
					return new Response("Bill not found", {
						status: 404,
					});
				}

				const fontSetup = await billCardFontSetupPromise;
				const billLabel = formatReminderBillLabel(bill.bill);
				const { card } = buildBillPreview({
					billLabel,
					dueDate: bill.bill.dueDate,
					settledAt: bill.bill.settledAt,
					totalAmount: bill.bill.totalAmount,
					hasEvenShares: bill.shareSummary.hasEvenShares,
					amountEach: bill.shareSummary.amountEach,
					participantCount: bill.shareSummary.participantCount,
					isAllSorted: bill.paymentProgress.percentage === 100,
				});

				const getOg = createOgRouteHandler({
					baseFonts: fontSetup.fonts,
					component: (
						<OgCard
							{...getBillOgCardProps(card)}
							fontFamily={fontSetup.families.base}
							title={truncate(billLabel, 40)}
						/>
					),
				});

				return await getOg({ params, request });
			},
		},
	},
});
