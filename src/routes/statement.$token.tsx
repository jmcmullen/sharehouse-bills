import { createFileRoute } from "@tanstack/react-router";
import {
	StatementHistory,
	StatementSummary,
	ledgerTime,
} from "../components/ledger/statement";
import { getHousemateStatement } from "../functions/ledger-statement";

export const Route = createFileRoute("/statement/$token")({
	loader: ({ params }) =>
		getHousemateStatement({ data: { token: params.token } }),
	head: () => ({
		meta: [
			{ title: "Your account statement · Sharehouse Bills" },
			{ name: "robots", content: "noindex, nofollow" },
			{ name: "referrer", content: "no-referrer" },
		],
	}),
	component: HousemateStatement,
});
function HousemateStatement() {
	const data = Route.useLoaderData();
	if (!data)
		return (
			<main className="mx-auto max-w-lg px-5 py-20">
				<h1 className="font-semibold text-2xl">
					This statement link is unavailable
				</h1>
				<p className="mt-4 text-muted-foreground">
					It may have expired or been replaced. Ask Jay for a new private
					statement link.
				</p>
			</main>
		);
	return (
		<main className="mx-auto max-w-3xl space-y-7 px-4 py-8 sm:px-6 sm:py-12">
			<header>
				<p className="text-muted-foreground text-sm">
					Sharehouse Bills · Private statement
				</p>
				<h1 className="mt-2 font-semibold text-3xl tracking-tight">
					{data.name}'s account
				</h1>
				<p className="mt-2 text-muted-foreground text-sm">
					Your charges, payments and running balance in one place.
				</p>
			</header>
			<div className="rounded-lg border bg-muted/40 p-4 text-sm">
				Jay is reviewing the payment history. This statement may change as
				payments are approved. Contact Jay if a payment is missing.
			</div>
			{data.updatesPending && (
				<output className="rounded-lg border p-4 text-sm">
					Recent changes are waiting to be synced. Ask Jay to refresh your
					statement before relying on this balance.
				</output>
			)}
			<StatementSummary {...data} />
			<p className="text-muted-foreground text-sm">
				Payments reduce your account balance. Credit covers charges due first
				and carries forward to future bills.
			</p>
			{data.reviewCount > 0 && (
				<p className="rounded-lg border p-4 text-sm">
					{data.reviewCount} incoming payment{data.reviewCount === 1 ? "" : "s"}{" "}
					awaiting review. These have not been added as extra credit. Some may
					already be recorded manually.
				</p>
			)}
			<StatementHistory entries={data.entries} />
			<footer className="border-t pt-4 text-muted-foreground text-xs">
				<p>Viewed {ledgerTime(data.asOf)}. All times are Sydney time.</p>
				<p className="mt-2">
					Keep this link private. Anyone with it can view your statement. Use
					Bills or Rent in your payment reference so Jay can identify it.
				</p>
			</footer>
		</main>
	);
}
