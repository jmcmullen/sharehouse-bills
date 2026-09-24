import type { HousemateStatementData } from "@/api/services/housemate-statement.server";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/share-preview";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { AmountHeader, PublicPage } from "./page-shell";
import { CreditNote } from "./pay-credit";
import { StatementMonthSection } from "./statement-rows";
import { PublicStatusBadge } from "./status-badge";

function StatementMonths({
	timeline,
}: {
	timeline: HousemateStatementData["timeline"];
}) {
	const [showEarlier, setShowEarlier] = useState(false);
	const months = showEarlier
		? [...timeline.recent, ...timeline.earlier]
		: timeline.recent;
	const hasEarlier = !showEarlier && timeline.earlier.length > 0;
	if (!months.length && !hasEarlier)
		return (
			<p className="text-[14px] text-muted-foreground leading-6">
				Nothing on your statement yet.
			</p>
		);
	return (
		<section className="space-y-6">
			{months.map((month) => (
				<StatementMonthSection key={month.key} month={month} />
			))}
			{hasEarlier ? (
				<Button
					variant="outline"
					className="h-11 w-full font-medium"
					onClick={() => setShowEarlier(true)}
				>
					Show earlier
				</Button>
			) : null}
		</section>
	);
}

// Every bill share and payment behind the housemate's pay link, in the pay
// page's layout. Tap a row to see what paid a bill or what a payment covered.
export function HousemateStatement({
	data,
	payPath,
}: {
	data: HousemateStatementData;
	payPath: string;
}) {
	return (
		<PublicPage hasFooter={false}>
			<a
				href={payPath}
				className="-ml-1 inline-flex items-center gap-1 self-start font-medium text-[13.5px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
			>
				<ChevronLeft className="h-4 w-4" />
				Back to pay
			</a>
			<AmountHeader
				name={data.housemate.name}
				label={data.headline.label}
				amount={formatCurrency(data.headline.amount)}
			>
				<PublicStatusBadge tone="neutral">Statement</PublicStatusBadge>
			</AmountHeader>
			<CreditNote credit={data.credit} />
			<StatementMonths timeline={data.timeline} />
		</PublicPage>
	);
}
