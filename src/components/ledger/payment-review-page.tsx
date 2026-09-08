import { Link, useLoaderData } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
	decideLedgerTransaction,
	getLedger,
	syncLedger,
} from "../../functions/ledger";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { ledgerMoney, ledgerTime } from "./statement";

type Ready = Extract<
	Awaited<ReturnType<typeof getLedger>>,
	{ available: true }
>;
type Payment = Ready["reviews"][number];
type Filters = {
	reviewPage: number;
	housemateId: string;
	status: "review" | "credit" | "exclude" | "linked";
	scope: "all" | "known" | "unidentified";
	recentOnly: boolean;
	query: string;
};
function ReviewPayment({
	payment,
	data,
	onClose,
	onSaved,
}: {
	payment: Payment;
	data: Ready;
	onClose: () => void;
	onSaved: () => Promise<void>;
}) {
	const [housemateId, setHousemateId] = useState(payment.housemateId ?? "");
	const [reason, setReason] = useState("");
	const [manual, setManual] = useState("");
	const [busy, setBusy] = useState(false);
	const candidates = data.manualPayments
		.filter(
			(item) =>
				item.housemateId === housemateId &&
				item.amountCents === -payment.amountCents,
		)
		.sort(
			(a, b) =>
				Math.abs(a.effectiveAt - payment.effectiveAt) -
				Math.abs(b.effectiveAt - payment.effectiveAt),
		);
	const eligible =
		payment.bankStatus === "SETTLED" && payment.currency === "AUD";
	async function decide(action: "credit" | "exclude" | "link") {
		setBusy(true);
		try {
			await decideLedgerTransaction({
				data: {
					transactionId: payment.id,
					action,
					housemateId: housemateId || undefined,
					manualSourceKey: manual || undefined,
					reason,
					expectedRevision: payment.revision,
				},
			});
			await onSaved();
			onClose();
			toast.success(
				action === "link"
					? "Linked without adding another credit"
					: action === "exclude"
						? "Payment excluded"
						: "Payment approved and account updated",
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not save the decision",
			);
		} finally {
			setBusy(false);
		}
	}
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !busy) onClose();
			}}
		>
			<DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Review {ledgerMoney(payment.amountCents)}</DialogTitle>
					<DialogDescription>
						{ledgerTime(payment.effectiveAt)}
					</DialogDescription>
				</DialogHeader>
				<div className="rounded-lg border p-4 text-sm">
					<p className="font-medium">{payment.description}</p>
					<p className="mt-2">
						Reference:{" "}
						<strong>{payment.message || "No reference supplied"}</strong>
					</p>
					<p className="mt-3 text-muted-foreground">{payment.reason}</p>
				</div>
				<label className="space-y-2 text-sm">
					<span>Housemate</span>
					<select
						className="h-10 w-full rounded-md border bg-background px-3"
						value={housemateId}
						onChange={(e) => {
							setHousemateId(e.target.value);
							setManual("");
						}}
					>
						<option value="">Choose housemate</option>
						{data.accounts.map((item) => (
							<option key={item.id} value={item.id}>
								{item.name}
							</option>
						))}
					</select>
				</label>
				{candidates.length > 0 && (
					<div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
						<p className="font-medium">A manual payment has the same amount</p>
						<p>
							Link it if this is the same receipt. Approving separately adds
							another credit.
						</p>
						<label className="block">
							Existing payment
							<select
								className="mt-2 h-10 w-full rounded-md border bg-background px-2"
								value={manual}
								onChange={(e) => setManual(e.target.value)}
							>
								<option value="">Choose a manual payment</option>
								{candidates.map((item) => (
									<option key={item.key} value={item.key}>
										{ledgerTime(item.effectiveAt)} · {item.description}
									</option>
								))}
							</select>
						</label>
					</div>
				)}
				<label htmlFor="review-reason" className="space-y-2 text-sm">
					<span>Reason for your decision</span>
					<Input
						id="review-reason"
						placeholder="e.g. Confirmed with Oliver: this was for gas"
						value={reason}
						onChange={(e) => setReason(e.target.value)}
					/>
				</label>
				{!eligible && (
					<p className="text-muted-foreground text-sm">
						Only settled AUD payments can be approved.
					</p>
				)}
				<div className="flex flex-wrap gap-2">
					<Button
						disabled={
							busy || !housemateId || reason.trim().length < 5 || !eligible
						}
						onClick={() => decide(manual ? "link" : "credit")}
					>
						{busy
							? "Saving…"
							: manual
								? "Link existing payment"
								: payment.amountCents < 0
									? "Approve refund"
									: "Approve payment"}
					</Button>
					<Button
						variant="outline"
						disabled={busy || reason.trim().length < 5}
						onClick={() => decide("exclude")}
					>
						Exclude
					</Button>
					<Button variant="ghost" disabled={busy} onClick={onClose}>
						Cancel
					</Button>
				</div>
				<details className="break-all text-muted-foreground text-xs">
					<summary>Bank transaction ID</summary>
					{payment.id}
				</details>
			</DialogContent>
		</Dialog>
	);
}
export function PaymentReviewPage() {
	const initial = useLoaderData({ from: "/_app/payment-review" });
	const [data, setData] = useState(initial);
	const [filters, setFilters] = useState<Filters>({
		reviewPage: 0,
		housemateId: "",
		status: "review",
		scope: "known",
		recentOnly: true,
		query: "",
	});
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState<Payment | null>(null);
	const [busy, setBusy] = useState(false);
	const request = useRef(0);
	async function refresh(next = filters) {
		const generation = ++request.current;
		setBusy(true);
		try {
			const result = await getLedger({ data: next });
			if (generation === request.current) {
				setData(result);
				setFilters(next);
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
						Approve incoming money before it changes a housemate's balance.
					</p>
				</div>
				<Button variant="outline" onClick={sync} disabled={busy}>
					{busy ? "Loading…" : "Refresh payments"}
				</Button>
			</header>
			<div className="rounded-xl border bg-muted/40 p-4 text-sm">
				<p>
					Automatic credits need <strong>Bills</strong> or <strong>Rent</strong>{" "}
					in the bank reference or description, plus an identified housemate.
					Everything else needs your approval.
				</p>
				<p className="mt-2 text-muted-foreground">
					Start with known housemates during the recorded bill history. Use the
					filters to include older or unidentified transfers.
				</p>
			</div>
			<div className="flex flex-wrap gap-2">
				{(
					[
						["review", "Needs approval"],
						["credit", "Recorded"],
						["linked", "Linked"],
						["exclude", "Excluded"],
					] as const
				).map(([status, label]) => (
					<Button
						key={status}
						variant={filters.status === status ? "default" : "outline"}
						aria-pressed={filters.status === status}
						onClick={() => filter({ status })}
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
			<div className="grid gap-3 sm:grid-cols-3">
				<select
					aria-label="Housemate filter"
					value={filters.housemateId || filters.scope}
					disabled={busy}
					onChange={(e) =>
						filter(
							["all", "known", "unidentified"].includes(e.target.value)
								? { housemateId: "", scope: e.target.value as Filters["scope"] }
								: { housemateId: e.target.value, scope: "all" },
						)
					}
					className="h-10 rounded-md border bg-background px-3"
				>
					<option value="known">Known housemates</option>
					<option value="all">All transactions</option>
					<option value="unidentified">Unidentified sender</option>
					{data.accounts.map((item) => (
						<option key={item.id} value={item.id}>
							{item.name}
						</option>
					))}
				</select>
				<select
					aria-label="History period"
					disabled={busy}
					value={filters.recentOnly ? "recent" : "all"}
					onChange={(e) => filter({ recentOnly: e.target.value === "recent" })}
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
			<div className="flex items-center justify-between text-muted-foreground text-sm">
				<output aria-live="polite">
					{data.reviewCount} matching payments{busy ? " · Updating…" : ""}
				</output>
				<span>{data.totalReviewCount} awaiting review overall</span>
			</div>
			<div className="divide-y rounded-xl border bg-card" aria-busy={busy}>
				{data.reviews.map((payment) => (
					<article
						key={payment.id}
						className="flex flex-wrap items-center justify-between gap-4 p-4"
					>
						<div className="min-w-0 flex-1">
							<p className="font-medium">
								{data.accounts.find(
									(account) => account.id === payment.housemateId,
								)?.name ?? "Unidentified sender"}{" "}
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
						</div>
						<div className="flex items-center gap-4">
							<span className="font-semibold tabular-nums">
								{ledgerMoney(payment.amountCents)}
							</span>
							<Button
								variant="outline"
								disabled={busy}
								onClick={() => setSelected(payment)}
							>
								{payment.decision === "review" ? "Review" : "View decision"}
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
