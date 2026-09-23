import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export const ledgerMoney = (cents: number): string =>
	new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(
		cents / 100,
	);
export const ledgerDate = (seconds: number): string =>
	new Intl.DateTimeFormat("en-AU", {
		timeZone: "Australia/Sydney",
		day: "numeric",
		month: "short",
		year: "numeric",
	}).format(new Date(seconds * 1000));
export const ledgerTime = (seconds: number): string =>
	new Intl.DateTimeFormat("en-AU", {
		timeZone: "Australia/Sydney",
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		timeZoneName: "short",
	}).format(new Date(seconds * 1000));
interface VisibleEntry {
	id: string;
	kind: string;
	description: string;
	amountCents: number;
	effectiveAt: number;
	dueAt: number | null;
	runningBalanceCents: number;
	isReversal: boolean;
}
export function StatementHistory({ entries }: { entries: VisibleEntry[] }) {
	const [query, setQuery] = useState("");
	const [kind, setKind] = useState("all");
	const [limit, setLimit] = useState(25);
	const filtered = [...entries]
		.reverse()
		.filter(
			(entry) =>
				(kind === "all" ||
					(kind === "payments"
						? entry.kind === "payment" || entry.kind === "refund"
						: entry.kind === "charge")) &&
				`${entry.description} ${ledgerMoney(Math.abs(entry.amountCents))} ${ledgerDate(entry.effectiveAt)}`
					.toLowerCase()
					.includes(query.toLowerCase()),
		);
	return (
		<section className="space-y-4" aria-label="Account activity">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 className="font-semibold text-lg">Account activity</h2>
				<span className="text-muted-foreground text-sm">
					Newest first · AUD
				</span>
			</div>
			<div className="flex flex-col gap-3 sm:flex-row">
				<Input
					aria-label="Search activity"
					placeholder="Search description, amount or date"
					value={query}
					onChange={(e) => {
						setQuery(e.target.value);
						setLimit(25);
					}}
				/>
				<select
					aria-label="Activity type"
					className="h-10 rounded-md border bg-background px-3"
					value={kind}
					onChange={(e) => {
						setKind(e.target.value);
						setLimit(25);
					}}
				>
					<option value="all">All activity</option>
					<option value="payments">Payments</option>
					<option value="charges">Charges</option>
				</select>
			</div>
			<p className="text-muted-foreground text-xs">
				The balance after each entry includes all activity, even when filtered.
				A minus balance means you are in credit.
			</p>
			<div className="divide-y rounded-xl border bg-card">
				{filtered.slice(0, limit).map((entry) => (
					<article key={entry.id} className="p-4 sm:p-5">
						<div className="flex items-start justify-between gap-4">
							<div className="min-w-0">
								<p className="break-words font-medium">
									{entry.isReversal ? "Correction: " : ""}
									{entry.description}
								</p>
								<p className="mt-1 text-muted-foreground text-sm">
									{ledgerDate(entry.effectiveAt)}
									{entry.dueAt ? ` · Due ${ledgerDate(entry.dueAt)}` : ""}
								</p>
							</div>
							<div className="shrink-0 text-right tabular-nums">
								<p
									className={
										entry.amountCents < 0
											? "font-semibold text-success"
											: "font-semibold"
									}
								>
									{entry.amountCents > 0 ? "+" : ""}
									{ledgerMoney(entry.amountCents)}
								</p>
								<p className="mt-1 text-muted-foreground text-xs">
									Balance {ledgerMoney(entry.runningBalanceCents)}
								</p>
							</div>
						</div>
						<details className="mt-2 text-muted-foreground text-xs">
							<summary className="cursor-pointer py-1">
								Transaction time
							</summary>
							{ledgerTime(entry.effectiveAt)}
						</details>
					</article>
				))}
				{filtered.length === 0 && (
					<p className="p-8 text-center text-muted-foreground">
						No activity matches this view.
					</p>
				)}
			</div>
			{filtered.length > limit && (
				<Button
					variant="outline"
					className="w-full"
					onClick={() => setLimit(limit + 25)}
				>
					Show 25 more ({filtered.length - limit} remaining)
				</Button>
			)}
		</section>
	);
}
