import { createFileRoute } from "@tanstack/react-router";
import { getHousemateStatementData } from "../api/services/housemate-statement.server";
import { OgCard } from "../lib/og-card";
import { loadGoogleFonts, resolveFontSetup } from "../lib/og-fonts.server";
import {
	createOgHeadResponse,
	createOgRouteHandler,
} from "../lib/og-route.server";
import { statementPreview } from "../lib/statement-preview";

const fontSetupPromise = resolveFontSetup({
	baseFonts: loadGoogleFonts({
		family: "Plus Jakarta Sans",
		weights: [500, 600, 700, 800],
	}),
});

export const Route = createFileRoute("/api/cards/pay/$token_/statement")({
	server: {
		handlers: {
			HEAD: () => createOgHeadResponse(),
			GET: async ({ params, request }) => {
				const data = await getHousemateStatementData(params.token);
				if (!data) return new Response("Statement not found", { status: 404 });
				const { card } = statementPreview({
					name: data.housemate.name,
					headline: data.headline,
					monthCount:
						data.timeline.recent.length + data.timeline.earlier.length,
				});
				const fontSetup = await fontSetupPromise;
				const getOg = createOgRouteHandler({
					baseFonts: fontSetup.fonts,
					component: <OgCard {...card} fontFamily={fontSetup.families.base} />,
				});
				return await getOg({ params, request });
			},
		},
	},
});
