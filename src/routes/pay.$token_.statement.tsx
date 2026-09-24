import { HousemateStatement } from "@/components/public/housemate-statement";
import { ExpiredLinkPage } from "@/components/public/page-shell";
import { getPublicHousemateStatement } from "@/functions/public-housemate-statement";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/pay/$token_/statement")({
	loader: ({ params }) =>
		getPublicHousemateStatement({ data: { token: params.token } }),
	head: ({ loaderData }) => ({
		meta: [
			{
				title: loaderData
					? `${loaderData.housemate.name}'s statement`
					: "This link has expired",
			},
			{ name: "robots", content: "noindex, nofollow" },
			{ name: "referrer", content: "no-referrer" },
		],
	}),
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
