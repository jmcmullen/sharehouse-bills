import { useState } from "react";
import { toast } from "sonner";
import { decideLedgerTransaction } from "../../functions/ledger";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import type { Payment } from "./review-payment";
import { ledgerMoney } from "./statement";

export function SplitPayment({
	payment,
	accounts,
	onSaved,
	onBusy,
}: {
	payment: Payment;
	accounts: Array<{ id: string; name: string }>;
	onSaved: () => Promise<void>;
	onBusy: (busy: boolean) => void;
}) {
	const [amounts, setAmounts] = useState<Record<string, string>>(
		Object.fromEntries(
			payment.allocations.map((item) => [
				item.housemateId,
				(item.amountCents / 100).toFixed(2),
			]),
		),
	);
	const [note, setNote] = useState("");
	const [busy, setBusy] = useState(false);
	const selected = accounts.filter(
		(account) => (amounts[account.id] ?? "").trim() !== "",
	);
	const allocations = selected.map((account) => ({
		housemateId: account.id,
		amountCents: Math.round(Number(amounts[account.id]) * 100),
	}));
	const valid = selected.every(
		(account) =>
			/^\d+(\.\d{1,2})?$/.test(amounts[account.id]) &&
			Number(amounts[account.id]) > 0,
	);
	const total = allocations.reduce((sum, item) => sum + item.amountCents, 0);
	const needsNote =
		payment.decision === "archive" || payment.group === "duplicate";
	async function save() {
		setBusy(true);
		onBusy(true);
		try {
			await decideLedgerTransaction({
				data: {
					transactionId: payment.id,
					action: "split",
					allocations,
					reason: note,
					expectedRevision: payment.revision,
				},
			});
			await onSaved();
			toast.success("Payment split between housemates");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not split payment",
			);
		} finally {
			setBusy(false);
			onBusy(false);
		}
	}
	return (
		<div className="space-y-4">
			<p className="text-muted-foreground text-sm">
				Enter each housemate's share. Leave everyone else blank. The shares must
				total {ledgerMoney(payment.amountCents)}.
			</p>
			{accounts.map((account) => (
				<label
					key={account.id}
					htmlFor={`split-${account.id}`}
					className="flex items-center justify-between gap-4 text-sm"
				>
					<span>{account.name}</span>
					<Input
						id={`split-${account.id}`}
						className="w-28 tabular-nums"
						inputMode="decimal"
						placeholder="0.00"
						value={amounts[account.id] ?? ""}
						disabled={busy}
						onChange={(e) =>
							setAmounts({ ...amounts, [account.id]: e.target.value })
						}
					/>
				</label>
			))}
			<output className="block text-sm tabular-nums" aria-live="polite">
				{valid
					? `${ledgerMoney(total)} allocated · ${ledgerMoney(payment.amountCents - total)} remaining`
					: "Use positive amounts with at most two decimal places"}
			</output>
			<label htmlFor="split-note" className="block space-y-2 text-sm">
				<span>
					{needsNote
						? "Explain the historical payment or separate receipt"
						: "Note (optional)"}
				</span>
				<Input
					id="split-note"
					value={note}
					disabled={busy}
					onChange={(e) => setNote(e.target.value)}
				/>
			</label>
			<Button
				disabled={
					busy ||
					!valid ||
					selected.length < 2 ||
					total !== payment.amountCents ||
					(needsNote && note.trim().length < 5)
				}
				onClick={save}
			>
				{busy ? "Saving…" : "Confirm allocation"}
			</Button>
		</div>
	);
}
