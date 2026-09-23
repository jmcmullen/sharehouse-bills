import { createFileRoute } from "@tanstack/react-router";
import {
	StatementHistory,
	ledgerMoney,
	ledgerTime,
} from "../components/ledger/statement";
import {
	MoneyReceived,
	StatementBills,
} from "../components/ledger/statement-bills";
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
		<main className="mx-auto max-w-2xl space-y-7 px-4 py-8 sm:px-6 sm:py-12">
			<header>
				<p className="text-muted-foreground text-sm">
					Sharehouse Bills · Private statement
				</p>
				<h1 className="mt-2 font-semibold text-3xl tracking-tight">
					{data.name}'s account
				</h1>
				<p className="mt-2 text-muted-foreground text-sm">
					Each bill share, what has covered it and what is left.
				</p>
			</header>
			<div className="grid gap-3 sm:grid-cols-2">
				<Summary
					label={data.balanceCents < 0 ? "In credit" : "Owed now"}
					cents={data.balanceCents < 0 ? -data.balanceCents : data.dueNowCents}
				/>
				<Summary
					label="Not yet applied to a bill"
					cents={data.billing.unallocatedCents}
				/>
			</div>
			{data.updatesPending && (
				<output className="block rounded-lg border p-4 text-sm">
					Recent changes are waiting to be synced. Ask Jay to refresh your
					statement before relying on this balance.
				</output>
			)}
			<StatementBills billing={data.billing} />
			{data.reviewCount > 0 && (
				<p className="rounded-lg border p-4 text-sm">
					{data.reviewCount} payment{data.reviewCount === 1 ? "" : "s"} from you{" "}
					{data.reviewCount === 1 ? "is" : "are"} waiting for Jay to confirm.
					Once confirmed it appears against the bill above.
				</p>
			)}
			<MoneyReceived billing={data.billing} />
			<details className="rounded-lg border p-4">
				<summary className="cursor-pointer text-sm">
					Journal and running balance
				</summary>
				<StatementHistory entries={data.entries} />
			</details>
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

function Summary(props: { label: string; cents: number }) {
	return (
		<div className="rounded-xl border bg-card p-4">
			<p className="text-muted-foreground text-sm">{props.label}</p>
			<p className="mt-2 font-semibold text-2xl tabular-nums">
				{ledgerMoney(props.cents)}
			</p>
		</div>
	);
}
