import {
	useLoaderData,
	useNavigate,
	useRouter,
	useRouterState,
	useSearch,
} from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { syncLedger } from "../../functions/ledger";
import { Button } from "../ui/button";
import { BatchReview } from "./batch-review";
import { confirmRow, excludeRow } from "./review-actions";
import { ReviewFilterBar, type ReviewFilters } from "./review-filters";
import { type Payment, ReviewPayment } from "./review-payment";
import { ReviewRow } from "./review-row";
import { ledgerMoney } from "./statement";

const pageSize = 25;
const selectionLimit = 10;

export function PaymentReviewPage() {
	const data = useLoaderData({ from: "/_app/payment-review" });
	const filters = useSearch({ from: "/_app/payment-review" });
	const navigate = useNavigate({ from: "/payment-review" });
	const router = useRouter();
	const loading = useRouterState({ select: (state) => state.isLoading });
	const [selected, setSelected] = useState<Payment | null>(null);
	const [busy, setBusy] = useState(false);
	const [checked, setChecked] = useState<string[]>([]);
	const [batchOpen, setBatchOpen] = useState(false);
	const disabled = busy || loading;

	function filter(change: Partial<ReviewFilters>) {
		setChecked([]);
		void navigate({
			search: (prev) => ({ ...prev, ...change, reviewPage: 0 }),
		});
	}
	async function showPage(page: number) {
		setChecked([]);
		if (page === filters.reviewPage) return router.invalidate();
		await navigate({ search: (prev) => ({ ...prev, reviewPage: page }) });
	}
	async function sync() {
		setBusy(true);
		try {
			await syncLedger();
			await router.invalidate();
		} catch {
			toast.error("Could not refresh payments");
		} finally {
			setBusy(false);
		}
	}
	// Reloads after a decision, stepping back a page when this one empties.
	async function decided(saved: boolean) {
		if (!saved || !data.available) return;
		await showPage(
			data.reviews.length === 1
				? Math.max(0, filters.reviewPage - 1)
				: filters.reviewPage,
		);
	}
	async function act(run: () => Promise<boolean>) {
		setBusy(true);
		try {
			await decided(await run());
		} finally {
			setBusy(false);
		}
	}
	if (!data.available) return <p>The ledger migration is not installed yet.</p>;
	const pages = Math.max(1, Math.ceil(data.reviewCount / pageSize));
	const chosen = data.reviews.filter((item) => checked.includes(item.id));
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
				<Button variant="outline" onClick={sync} disabled={disabled}>
					{disabled ? "Loading…" : "Refresh payments"}
				</Button>
			</header>
			<p className="text-muted-foreground text-sm">
				Nothing is credited until you confirm it. Each payment from a housemate
				shows the bills it looks like it covers: confirm the suggestion, change
				it, keep the money as credit, or mark it as not a bill. Shared payments
				are split first. Other personal account activity is ignored.
			</p>
			<ReviewFilterBar
				filters={filters}
				accounts={data.accounts}
				busy={disabled}
				onChange={filter}
			/>
			<div className="flex items-center justify-between text-muted-foreground text-sm">
				<output aria-live="polite">
					{data.reviewCount} matching payments{loading ? " · Updating…" : ""}
				</output>
			</div>
			{chosen.length > 0 && (
				<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted p-3">
					<output aria-live="polite" className="text-sm">
						{chosen.length} selected ·{" "}
						{ledgerMoney(
							chosen.reduce((sum, item) => sum + item.amountCents, 0),
						)}
					</output>
					<Button onClick={() => setBatchOpen(true)} disabled={disabled}>
						Review selected
					</Button>
				</div>
			)}
			<div className="divide-y rounded-xl border bg-card" aria-busy={disabled}>
				{data.reviews.map((payment) => (
					<ReviewRow
						key={payment.id}
						payment={payment}
						name={
							data.accounts.find((item) => item.id === payment.housemateId)
								?.name
						}
						busy={disabled}
						selectable={filters.status === "review"}
						checked={checked.includes(payment.id)}
						selectionFull={checked.length >= selectionLimit}
						onCheck={(on) =>
							setChecked(
								on
									? [...checked, payment.id]
									: checked.filter((id) => id !== payment.id),
							)
						}
						onOpen={() => setSelected(payment)}
						onConfirm={(allocations) =>
							act(() => confirmRow(payment, allocations))
						}
						onExclude={() => act(() => excludeRow(payment))}
					/>
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
					disabled={disabled || filters.reviewPage === 0}
					onClick={() => showPage(filters.reviewPage - 1)}
				>
					Previous
				</Button>
				<span className="text-muted-foreground text-sm">
					Page {filters.reviewPage + 1} of {pages}
				</span>
				<Button
					variant="outline"
					disabled={disabled || filters.reviewPage + 1 >= pages}
					onClick={() => showPage(filters.reviewPage + 1)}
				>
					Next
				</Button>
			</div>
			{batchOpen && (
				<BatchReview
					payments={chosen}
					accounts={data.accounts}
					onClose={() => setBatchOpen(false)}
					onSaved={async () => {
						setBatchOpen(false);
						await showPage(0);
					}}
				/>
			)}
			{selected && (
				<ReviewPayment
					key={selected.id}
					payment={selected}
					data={data}
					onClose={() => setSelected(null)}
					onSaved={() => decided(true)}
				/>
			)}
		</div>
	);
}
