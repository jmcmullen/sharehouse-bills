import { createFileRoute } from "@tanstack/react-router";
import { getPublicBillPageData } from "../api/services/public-bill-page.server";
import { OgCard } from "../lib/og-card";
import { loadGoogleFonts, resolveFontSetup } from "../lib/og-fonts.server";
import { createOgRouteHandler } from "../lib/og-route.server";
import {
	type BillDueStatus,
	formatCurrency,
	getBillDueStatus,
	truncate,
} from "../lib/share-preview";

type BillOgCardProps = {
	backgroundColor: string;
	primaryValue: string;
	secondaryColor: string;
	secondaryValue?: string | null;
	tertiaryColor?: string;
	tertiaryValue?: string | null;
	titleColor: string;
};

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

function getBillOgCardProps(input: {
	isAllSorted: boolean;
	dueStatus: BillDueStatus;
	primaryValue: string;
	secondaryValue: string | null;
	tertiaryValue: string | null;
}): BillOgCardProps {
	if (input.isAllSorted) {
		return {
			backgroundColor: "#0d1f14",
			primaryValue: "Paid in full",
			secondaryColor: "#b9e4c9",
			secondaryValue: "Thanks everyone",
			tertiaryColor: "#8fc6a5",
			tertiaryValue: "Settled and squared away",
			titleColor: "#f0fbf4",
		};
	}

	if (input.dueStatus.tone === "overdue") {
		return {
			backgroundColor: "#291717",
			primaryValue: input.primaryValue,
			secondaryColor: "#e0b5b8",
			secondaryValue: input.dueStatus.label,
			tertiaryColor: "#c99599",
			tertiaryValue: input.tertiaryValue ?? input.secondaryValue,
			titleColor: "#fff2f1",
		};
	}

	if (input.dueStatus.tone === "today") {
		return {
			backgroundColor: "#2b2212",
			primaryValue: input.primaryValue,
			secondaryColor: "#e7c37d",
			secondaryValue: "Due today",
			tertiaryColor: "#c59b50",
			tertiaryValue: input.tertiaryValue ?? input.secondaryValue,
			titleColor: "#fff4d7",
		};
	}

	return {
		backgroundColor: "#2a2824",
		primaryValue: input.primaryValue,
		secondaryColor: "#b8b0a0",
		secondaryValue: input.secondaryValue,
		tertiaryColor: "#938b7d",
		tertiaryValue: input.tertiaryValue,
		titleColor: "#e8e3d6",
	};
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
				const dueStatus = getBillDueStatus(bill.bill.dueDate);
				const primaryValue = bill.shareSummary.hasEvenShares
					? bill.shareSummary.amountEach !== null
						? `${formatCurrency(bill.shareSummary.amountEach)} each`
						: formatCurrency(bill.bill.totalAmount)
					: formatCurrency(bill.bill.totalAmount);
				const splitValue =
					!bill.shareSummary.hasEvenShares &&
					bill.shareSummary.participantCount > 0
						? `Split across ${bill.shareSummary.participantCount} ${bill.shareSummary.participantCount === 1 ? "housemate" : "housemates"}`
						: null;
				const totalValue = `Total ${formatCurrency(bill.bill.totalAmount)}`;
				const cardProps = getBillOgCardProps({
					isAllSorted,
					dueStatus,
					primaryValue,
					secondaryValue:
						bill.shareSummary.hasEvenShares &&
						bill.shareSummary.amountEach !== null
							? totalValue
							: null,
					tertiaryValue: splitValue,
				});

				const getOg = createOgRouteHandler({
					baseFonts: fontSetup.fonts,
					component: (
						<OgCard
							{...cardProps}
							fontFamily={fontSetup.families.base}
							title={truncate(
								getBillOgTitle({
									billerName: bill.bill.billerName,
									recurringTemplateName: bill.bill.recurringTemplateName,
								}),
								40,
							)}
						/>
					),
				});

				return await getOg({ params, request });
			},
		},
	},
});
