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
	const [busy, setBusy] = useState(false);
	const totals = Object.entries(
		payments.reduce<Record<string, number>>((result, payment) => {
			const name =
				accounts.find((account) => account.id === payment.housemateId)?.name ??
				"Unidentified";
			result[name] = (result[name] ?? 0) + payment.amountCents;
			return result;
		}, {}),
	);
	async function confirm() {
		setBusy(true);
		try {
			await decideLedgerBatch({
				data: payments.map((payment) => ({
					transactionId: payment.id,
					action: "exclude",
					reason: "Not a household payment; reviewed together",
					expectedRevision: payment.revision,
				})),
			});
			await onSaved();
			toast.success(`${payments.length} payments dismissed`);
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
						Mark these as not household payments. They will remain searchable in
						Ignored and add no credit to housemates.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-2 rounded-lg bg-muted p-3 text-sm">
					{totals.map(([name, total]) => (
						<p key={name} className="flex justify-between gap-3">
							<span>{name}</span>
							<strong className="tabular-nums">{ledgerMoney(total)}</strong>
						</p>
					))}
				</div>
				<ul className="divide-y text-sm">
					{payments.map((payment) => (
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
							</p>
						</li>
					))}
				</ul>
				<div className="flex flex-wrap gap-2">
					<Button onClick={confirm} disabled={busy}>
						{busy ? "Saving…" : "Confirm not household payments"}
					</Button>
					<Button variant="ghost" onClick={onClose} disabled={busy}>
						Cancel
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
