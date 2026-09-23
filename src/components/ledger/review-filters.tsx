import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { z } from "zod";
import type { reviewFiltersSchema } from "../../api/services/ledger/payment-review-data";
import { reviewGroups } from "../../api/services/ledger/review-policy";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export type ReviewFilters = z.infer<typeof reviewFiltersSchema>;

const statusTabs = [
	["review", "Needs attention"],
	["credit", "Recorded"],
	["linked", "Linked"],
	["exclude", "Ignored"],
	["archive", "History"],
] as const;
const scopes: ReviewFilters["scope"][] = ["all", "known", "unidentified"];

export function ReviewFilterBar({
	filters,
	accounts,
	busy,
	onChange,
}: {
	filters: ReviewFilters;
	accounts: Array<{ id: string; name: string }>;
	busy: boolean;
	onChange: (change: Partial<ReviewFilters>) => void;
}) {
	const [query, setQuery] = useState(filters.query);
	return (
		<>
			<div className="flex flex-wrap gap-2">
				{statusTabs.map(([status, label]) => (
					<Button
						key={status}
						variant={filters.status === status ? "default" : "outline"}
						aria-pressed={filters.status === status}
						onClick={() =>
							onChange({
								status,
								group: "all",
								recentOnly: status !== "archive",
								scope: "all",
								housemateId: undefined,
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
						<GroupChips filters={filters} busy={busy} onChange={onChange} />
					)}
					<div className="grid gap-3 sm:grid-cols-3">
						<HousemateFilter
							filters={filters}
							accounts={accounts}
							busy={busy}
							onChange={onChange}
						/>
						<select
							aria-label="History period"
							disabled={busy}
							value={filters.recentOnly ? "recent" : "all"}
							onChange={(e) =>
								onChange({ recentOnly: e.target.value === "recent" })
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
								onChange({ query });
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
		</>
	);
}

function GroupChips({
	filters,
	busy,
	onChange,
}: {
	filters: ReviewFilters;
	busy: boolean;
	onChange: (change: Partial<ReviewFilters>) => void;
}) {
	return (
		<div className="flex flex-wrap gap-2" aria-label="Review reasons">
			<Button
				variant={filters.group === "all" ? "secondary" : "ghost"}
				onClick={() => onChange({ group: "all" })}
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
					onClick={() => onChange({ group: key as keyof typeof reviewGroups })}
				>
					{label}
				</Button>
			))}
		</div>
	);
}

function HousemateFilter({
	filters,
	accounts,
	busy,
	onChange,
}: {
	filters: ReviewFilters;
	accounts: Array<{ id: string; name: string }>;
	busy: boolean;
	onChange: (change: Partial<ReviewFilters>) => void;
}) {
	function select(value: string) {
		const scope = scopes.find((item) => item === value);
		onChange(
			scope
				? { housemateId: undefined, scope }
				: { housemateId: value, scope: "all" },
		);
	}
	return (
		<select
			aria-label="Housemate filter"
			value={filters.housemateId || filters.scope}
			disabled={busy}
			onChange={(e) => select(e.target.value)}
			className="h-10 rounded-md border bg-background px-3"
		>
			<option value="all">
				{filters.status === "review" ? "All housemates" : "All transactions"}
			</option>
			{filters.status !== "review" && (
				<>
					<option value="known">Known housemates</option>
					<option value="unidentified">Unidentified sender</option>
				</>
			)}
			{accounts.map((item) => (
				<option key={item.id} value={item.id}>
					{item.name}
				</option>
			))}
		</select>
	);
}
