import { BillPdfStorageService } from "@/api/services/bill-pdf-storage";
import { HousemateStatement } from "@/components/public/housemate-statement";
import { ExpiredLinkPage } from "@/components/public/page-shell";
import { getPublicHousemateStatement } from "@/functions/public-housemate-statement";
import { buildOpenGraphMeta } from "@/lib/share-preview";
import { statementPreview } from "@/lib/statement-preview";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/pay/$token_/statement")({
	loader: ({ params }) =>
		getPublicHousemateStatement({ data: { token: params.token } }),
	head: ({ loaderData, params }) => {
		const hidden = [
			{ name: "robots", content: "noindex, nofollow" },
			{ name: "referrer", content: "no-referrer" },
		];
		if (!loaderData)
			return { meta: [{ title: "This link has expired" }, ...hidden] };
		const preview = statementPreview({
			name: loaderData.housemate.name,
			headline: loaderData.headline,
			monthCount:
				loaderData.timeline.recent.length + loaderData.timeline.earlier.length,
		});
		return {
			meta: [
				{ title: preview.title },
				...hidden,
				{ name: "description", content: preview.description },
				...buildOpenGraphMeta({
					title: preview.title,
					description: preview.description,
					url: BillPdfStorageService.getAbsoluteAppUrl(
						`/pay/${params.token}/statement`,
					),
					imageUrl: BillPdfStorageService.getAbsoluteAppUrl(
						BillPdfStorageService.getStatementOgImageUrl(params.token),
					),
				}),
			],
		};
	},
	component: StatementPage,
});

function StatementPage() {
	const data = Route.useLoaderData();
	const { token } = Route.useParams();
	if (!data)
		return (
			<ExpiredLinkPage
				title="Hmm, this statement's gone walkabout"
				body="The link might be old. Ask whoever sent it for a fresh one."
			/>
		);
	return <HousemateStatement data={data} payPath={`/pay/${token}`} />;
}
