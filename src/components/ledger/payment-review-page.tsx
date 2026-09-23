import { Link, useLoaderData } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { getLedger, syncLedger } from "../../functions/ledger";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ledgerMoney, ledgerTime } from "./statement";

import {
	reviewGroups,
	reviewHint,
} from "../../api/services/ledger/review-policy";
import { BatchReview } from "./batch-review";
import type { Payment } from "./review-payment";
import { ReviewPayment } from "./review-payment";

type Filters = {
	reviewPage: number;
	housemateId: string;
	status: "review" | "credit" | "exclude" | "linked" | "archive";
	scope: "all" | "known" | "unidentified";
	recentOnly: boolean;
	query: string;
	group: "all" | keyof typeof reviewGroups;
};
export function PaymentReviewPage() {
	const initial = useLoaderData({ from: "/_app/payment-review" });
	const [data, setData] = useState(initial);
	const [filters, setFilters] = useState<Filters>({
		reviewPage: 0,
		housemateId: "",
		status: "review",
		scope: "all",
		group: "all",
		recentOnly: true,
		query: "",
	});
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState<Payment | null>(null);
	const [busy, setBusy] = useState(false);
	const [checked, setChecked] = useState<string[]>([]);
	const [batchOpen, setBatchOpen] = useState(false);
	const request = useRef(0);
	async function refresh(next = filters) {
		const generation = ++request.current;
		setBusy(true);
		try {
			const result = await getLedger({ data: next });
			if (generation === request.current) {
				setData(result);
				setFilters(next);
				setChecked([]);
			}
		} catch {
			toast.error("Could not load payments. Try again.");
		} finally {
			if (generation === request.current) setBusy(false);
		}
	}
	function filter(change: Partial<Filters>) {
		void refresh({ ...filters, ...change, reviewPage: 0 });
	}
	async function sync() {
		setBusy(true);
		try {
			await syncLedger();
			await refresh();
		} catch {
			toast.error("Could not refresh payments");
			setBusy(false);
		}
	}
	if (!data.available) return <p>The ledger migration is not installed yet.</p>;
	return (
		<div className="mx-auto max-w-5xl space-y-6">
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="font-semibold text-3xl tracking-tight">
						Payment review
					</h1>
					<p className="mt-2 text-muted-foreground">
						Review payments that match your housemates.
					</p>
				</div>
				<Button variant="outline" onClick={sync} disabled={busy}>
					{busy ? "Loading…" : "Refresh payments"}
				</Button>
			</header>
			<p className="text-muted-foreground text-sm">
				Rent, bills, cleaning and utility references are accepted automatically
				for identified housemates. Missing references, possible duplicates and
				shared payments need a decision. Other personal account activity is
				ignored.
			</p>
			<div className="flex flex-wrap gap-2">
				{(
					[
						["review", "Needs attention"],
						["credit", "Recorded"],
						["linked", "Linked"],
						["exclude", "Ignored"],
						["archive", "History"],
					] as const
				).map(([status, label]) => (
					<Button
						key={status}
						variant={filters.status === status ? "default" : "outline"}
						aria-pressed={filters.status === status}
						onClick={() =>
							filter({
								status,
								group: "all",
								recentOnly: status !== "archive",
								scope: "all",
								housemateId: "",
							})
						}
						disabled={busy}
					>
						{label}
					</Button>
				))}
				<Link
					to="/ledger"
					className="ml-auto self-center text-sm underline underline-offset-4"
				>
					View accounts
				</Link>
			</div>
			<details className="rounded-xl border p-3">
				<summary className="cursor-pointer font-medium text-sm">
					Filter and search
					{filters.group !== "all" ? ` · ${reviewGroups[filters.group]}` : ""}
				</summary>
				<div className="mt-4 space-y-4">
					{filters.status === "review" && (
						<div className="flex flex-wrap gap-2" aria-label="Review reasons">
							<Button
								variant={filters.group === "all" ? "secondary" : "ghost"}
								onClick={() => filter({ group: "all" })}
								disabled={busy}
							>
								All reasons
							</Button>
							{Object.entries(reviewGroups).map(([key, label]) => (
								<Button
									key={key}
									variant={filters.group === key ? "secondary" : "ghost"}
									aria-pressed={filters.group === key}
									disabled={busy}
									onClick={() =>
										filter({ group: key as keyof typeof reviewGroups })
									}
								>
									{label}
								</Button>
							))}
						</div>
					)}
					<div className="grid gap-3 sm:grid-cols-3">
						<HousemateFilter
							filters={filters}
							accounts={data.accounts}
							busy={busy}
							onChange={filter}
						/>
						<select
							aria-label="History period"
							disabled={busy}
							value={filters.recentOnly ? "recent" : "all"}
							onChange={(e) =>
								filter({ recentOnly: e.target.value === "recent" })
							}
							className="h-10 rounded-md border bg-background px-3"
						>
							<option value="recent">Since bill records began</option>
							<option value="all">All bank history</option>
						</select>
						<form
							className="flex gap-2"
							onSubmit={(e) => {
								e.preventDefault();
								filter({ query });
							}}
						>
							<Input
								aria-label="Search payments"
								placeholder="Sender or reference"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
							/>
							<Button variant="outline" disabled={busy}>
								Search
							</Button>
						</form>
					</div>
				</div>
			</details>
			<div className="flex items-center justify-between text-muted-foreground text-sm">
				<output aria-live="polite">
					{data.reviewCount} matching payments{busy ? " · Updating…" : ""}
				</output>
			</div>
			{checked.length > 0 && (
				<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted p-3">
					<output aria-live="polite" className="text-sm">
						{checked.length} selected ·{" "}
						{ledgerMoney(
							data.reviews
								.filter((item) => checked.includes(item.id))
								.reduce((sum, item) => sum + item.amountCents, 0),
						)}
					</output>
					<Button onClick={() => setBatchOpen(true)} disabled={busy}>
						Review selected
					</Button>
				</div>
			)}
			<div className="divide-y rounded-xl border bg-card" aria-busy={busy}>
				{data.reviews.map((payment) => (
					<article
						key={payment.id}
						className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 p-4 sm:flex sm:items-center sm:justify-between sm:gap-4"
					>
						{filters.status === "review" && (
							<input
								type="checkbox"
								className="size-5 shrink-0"
								aria-label={`Select ${payment.message || payment.description} ${ledgerMoney(payment.amountCents)}`}
								checked={checked.includes(payment.id)}
								disabled={
									busy ||
									(!checked.includes(payment.id) && checked.length >= 10)
								}
								onChange={(event) =>
									setChecked(
										event.target.checked
											? [...checked, payment.id]
											: checked.filter((id) => id !== payment.id),
									)
								}
							/>
						)}
						<div className="col-start-2 min-w-0 flex-1">
							<p className="font-medium">
								{data.accounts.find(
									(account) => account.id === payment.housemateId,
								)?.name ??
									(payment.allocations.length > 1 || payment.shared
										? "Shared payment"
										: "Choose housemate")}{" "}
								<span className="ml-2 font-normal text-muted-foreground text-sm">
									{payment.origin === "review"
										? "Reviewed"
										: payment.decision === "credit"
											? "Automatic"
											: ""}
								</span>
							</p>
							<p className="mt-1 break-words text-sm">
								{payment.message || "No reference"} · {payment.description}
							</p>
							<p className="mt-1 text-muted-foreground text-xs">
								{ledgerTime(payment.effectiveAt)}
							</p>
							{(payment.decision === "review" || payment.matchCandidate) && (
								<p className="mt-2 text-amber-700 text-sm dark:text-amber-300">
									{reviewHint(payment)}
								</p>
							)}
						</div>
						<div className="col-start-2 flex items-center justify-between gap-4 sm:justify-start">
							<span className="font-semibold tabular-nums">
								{ledgerMoney(payment.amountCents)}
							</span>
							<Button
								variant="outline"
								disabled={busy}
								onClick={() => setSelected(payment)}
							>
								{payment.decision === "review" || payment.matchCandidate
									? "Review"
									: "View decision"}
							</Button>
						</div>
					</article>
				))}
				{data.reviews.length === 0 && (
					<div className="p-10 text-center">
						<p className="font-medium">No payments in this view</p>
						<p className="mt-2 text-muted-foreground text-sm">
							Change the filters to include other housemates or older activity.
						</p>
					</div>
				)}
			</div>
			<div className="flex items-center justify-between">
				<Button
					variant="outline"
					disabled={busy || filters.reviewPage === 0}
					onClick={() =>
						refresh({ ...filters, reviewPage: filters.reviewPage - 1 })
					}
				>
					Previous
				</Button>
				<span className="text-muted-foreground text-sm">
					Page {filters.reviewPage + 1} of{" "}
					{Math.max(1, Math.ceil(data.reviewCount / 25))}
				</span>
				<Button
					variant="outline"
					disabled={busy || (filters.reviewPage + 1) * 25 >= data.reviewCount}
					onClick={() =>
						refresh({ ...filters, reviewPage: filters.reviewPage + 1 })
					}
				>
					Next
				</Button>
			</div>
			{batchOpen && (
				<BatchReview
					payments={data.reviews.filter((item) => checked.includes(item.id))}
					accounts={data.accounts}
					onClose={() => setBatchOpen(false)}
					onSaved={async () => {
						setBatchOpen(false);
						await refresh({ ...filters, reviewPage: 0 });
					}}
				/>
			)}
			{selected && (
				<ReviewPayment
					key={selected.id}
					payment={selected}
					data={data}
					onClose={() => setSelected(null)}
					onSaved={() =>
						refresh({
							...filters,
							reviewPage:
								data.reviews.length === 1
									? Math.max(0, filters.reviewPage - 1)
									: filters.reviewPage,
						})
					}
				/>
			)}
		</div>
	);
}

function HousemateFilter(props: {
	filters: Filters;
	accounts: Array<{ id: string; name: string }>;
	busy: boolean;
	onChange: (filters: Partial<Filters>) => void;
}) {
	return (
		<select
			aria-label="Housemate filter"
			value={props.filters.housemateId || props.filters.scope}
			disabled={props.busy}
			onChange={(e) =>
				props.onChange(
					["all", "known", "unidentified"].includes(e.target.value)
						? {
								housemateId: "",
								scope: e.target.value as Filters["scope"],
							}
						: { housemateId: e.target.value, scope: "all" },
				)
			}
			className="h-10 rounded-md border bg-background px-3"
		>
			<option value="all">
				{props.filters.status === "review"
					? "All housemates"
					: "All transactions"}
			</option>
			{props.filters.status !== "review" && (
				<>
					<option value="known">Known housemates</option>
					<option value="unidentified">Unidentified sender</option>
				</>
			)}
			{props.accounts.map((item) => (
				<option key={item.id} value={item.id}>
					{item.name}
				</option>
			))}
		</select>
	);
}
