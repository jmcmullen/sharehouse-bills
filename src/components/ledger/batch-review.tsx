import { useState } from "react";
import { toast } from "sonner";
import { decideLedgerBatch } from "../../functions/ledger";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import type { Payment } from "./review-payment";
import { ledgerMoney, ledgerTime } from "./statement";

type Mode = "exclude" | "confirm";

// Rows the server will accept in a bulk confirmation: an exact single-bill
// match for an identified housemate with no sign the money is recorded already.
function exactMatches(payments: Payment[]): Payment[] {
	return payments.filter(
		(payment) =>
			payment.housemateId !== null &&
			!payment.matchCandidate &&
			payment.suggestion?.confidence === "exact",
	);
}

function housemateTotals(
	payments: Payment[],
	accounts: Array<{ id: string; name: string }>,
): Array<[string, number]> {
	const totals = new Map<string, number>();
	for (const payment of payments) {
		const name =
			accounts.find((account) => account.id === payment.housemateId)?.name ??
			"Unidentified";
		totals.set(name, (totals.get(name) ?? 0) + payment.amountCents);
	}
	return [...totals];
}

export function BatchReview({
	payments,
	accounts,
	onClose,
	onSaved,
}: {
	payments: Payment[];
	accounts: Array<{ id: string; name: string }>;
	onClose: () => void;
	onSaved: () => Promise<void>;
}) {
	const exact = exactMatches(payments);
	const [mode, setMode] = useState<Mode>(exact.length ? "confirm" : "exclude");
	const [busy, setBusy] = useState(false);
	const chosen = mode === "confirm" ? exact : payments;
	const totals = housemateTotals(chosen, accounts);
	async function save() {
		setBusy(true);
		try {
			await decideLedgerBatch({
				data: chosen.map((payment) =>
					mode === "confirm"
						? {
								transactionId: payment.id,
								action: "confirm" as const,
								reason: "",
								expectedRevision: payment.revision,
							}
						: {
								transactionId: payment.id,
								action: "exclude" as const,
								reason: "Not a household payment; reviewed together",
								expectedRevision: payment.revision,
							},
				),
			});
			await onSaved();
			toast.success(
				mode === "confirm"
					? `${chosen.length} payments confirmed`
					: `${chosen.length} payments dismissed`,
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not save decisions",
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
			<DialogContent className="max-h-[90dvh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Review {payments.length} selected payments</DialogTitle>
					<DialogDescription>
						{mode === "confirm"
							? "Confirm each suggested match. The payment is credited and its bill is marked paid."
							: "Mark these as not household payments. They will remain searchable in Ignored and add no credit to housemates."}
					</DialogDescription>
				</DialogHeader>
				{exact.length > 0 && (
					<div className="flex gap-2">
						<Button
							variant={mode === "confirm" ? "secondary" : "ghost"}
							aria-pressed={mode === "confirm"}
							disabled={busy}
							onClick={() => setMode("confirm")}
						>
							Confirm suggested ({exact.length})
						</Button>
						<Button
							variant={mode === "exclude" ? "secondary" : "ghost"}
							aria-pressed={mode === "exclude"}
							disabled={busy}
							onClick={() => setMode("exclude")}
						>
							Not household payments
						</Button>
					</div>
				)}
				<div className="space-y-2 rounded-lg bg-muted p-3 text-sm">
					{totals.map(([name, total]) => (
						<p key={name} className="flex justify-between gap-3">
							<span>{name}</span>
							<strong className="tabular-nums">{ledgerMoney(total)}</strong>
						</p>
					))}
				</div>
				<ul className="divide-y text-sm">
					{chosen.map((payment) => (
						<li key={payment.id} className="py-3">
							<p className="flex justify-between gap-3">
								<span>
									{payment.message || "No reference"} · {payment.description}
								</span>
								<strong className="shrink-0 tabular-nums">
									{ledgerMoney(payment.amountCents)}
								</strong>
							</p>
							<p className="mt-1 text-muted-foreground text-xs">
								{ledgerTime(payment.effectiveAt)}
								{mode === "confirm" && payment.suggestion
									? ` · ${payment.suggestion.reason}`
									: ""}
							</p>
						</li>
					))}
				</ul>
				{mode === "confirm" && chosen.length < payments.length && (
					<p className="text-muted-foreground text-sm">
						{payments.length - chosen.length} selected payments have no exact
						match and stay in review.
					</p>
				)}
				<div className="flex flex-wrap gap-2">
					<Button onClick={save} disabled={busy}>
						{busy
							? "Saving…"
							: mode === "confirm"
								? `Confirm ${chosen.length} suggested`
								: "Confirm not household payments"}
					</Button>
					<Button variant="ghost" onClick={onClose} disabled={busy}>
						Cancel
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
