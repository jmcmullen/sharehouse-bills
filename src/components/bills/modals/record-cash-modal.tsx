import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import type { CashReceiptData, GroupedBill } from "../types";
import { formatCurrency } from "../utils";

interface RecordCashModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	bill: GroupedBill | null;
	onConfirm: (data: CashReceiptData) => void;
	isProcessing: boolean;
}

function today() {
	return new Date().toLocaleDateString("en-CA");
}

function remainingFor(debt: GroupedBill["debts"][number]["debt"]) {
	return Math.max(0, Math.round((debt.amountOwed - debt.amountPaid) * 100));
}

export function RecordCashModal({
	open,
	onOpenChange,
	bill,
	onConfirm,
	isProcessing,
}: RecordCashModalProps) {
	if (!bill) return null;
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<CashForm
					key={bill.bill.id}
					bill={bill}
					onConfirm={onConfirm}
					isProcessing={isProcessing}
				/>
			</DialogContent>
		</Dialog>
	);
}

function CashForm({
	bill,
	onConfirm,
	isProcessing,
}: Omit<RecordCashModalProps, "open" | "onOpenChange" | "bill"> & {
	bill: GroupedBill;
}) {
	const shares = bill.debts.filter(({ debt }) => remainingFor(debt) > 0);
	const [debtId, setDebtId] = useState(shares[0]?.debt.id ?? "");
	const share = shares.find(({ debt }) => debt.id === debtId);
	const remaining = share ? remainingFor(share.debt) : 0;
	const [amount, setAmount] = useState((remaining / 100).toFixed(2));
	const [date, setDate] = useState(today());
	const [note, setNote] = useState("");
	const amountCents = Math.round(Number(amount) * 100);
	const valid =
		Boolean(share) &&
		Number.isFinite(amountCents) &&
		amountCents > 0 &&
		amountCents <= remaining &&
		date.length > 0;

	function choose(id: string) {
		setDebtId(id);
		const next = shares.find(({ debt }) => debt.id === id);
		setAmount(next ? (remainingFor(next.debt) / 100).toFixed(2) : "");
	}

	return (
		<form
			className="space-y-5"
			onSubmit={(event) => {
				event.preventDefault();
				if (!valid) return;
				onConfirm({
					debtId,
					amountCents,
					receivedAt: Math.floor(new Date(`${date}T00:00:00`).getTime() / 1000),
					note: note.trim(),
				});
			}}
		>
			<DialogHeader>
				<DialogTitle>Record cash received</DialogTitle>
				<DialogDescription>
					Cash for <span className="font-semibold">{bill.bill.billerName}</span>{" "}
					is applied to the share straight away and the housemate gets a
					receipt.
				</DialogDescription>
			</DialogHeader>
			{shares.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					Every share of this bill is already paid.
				</p>
			) : (
				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="cash-housemate">From</Label>
						<select
							id="cash-housemate"
							className="h-10 w-full rounded-md border bg-background px-3 text-sm"
							value={debtId}
							onChange={(event) => choose(event.target.value)}
						>
							{shares.map(({ debt, housemate }) => (
								<option key={debt.id} value={debt.id}>
									{housemate.name} · {formatCurrency(remainingFor(debt) / 100)}{" "}
									remaining
								</option>
							))}
						</select>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="cash-amount">Amount</Label>
							<Input
								id="cash-amount"
								type="number"
								inputMode="decimal"
								step="0.01"
								min="0.01"
								max={(remaining / 100).toFixed(2)}
								value={amount}
								onChange={(event) => setAmount(event.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="cash-date">Received on</Label>
							<Input
								id="cash-date"
								type="date"
								max={today()}
								value={date}
								onChange={(event) => setDate(event.target.value)}
							/>
						</div>
					</div>
					<div className="space-y-2">
						<Label htmlFor="cash-note">Note (optional)</Label>
						<Input
							id="cash-note"
							maxLength={200}
							placeholder="Handed over at dinner"
							value={note}
							onChange={(event) => setNote(event.target.value)}
						/>
					</div>
					{amountCents > remaining && (
						<p className="text-destructive text-sm">
							Cash cannot exceed the {formatCurrency(remaining / 100)} remaining
							on this share.
						</p>
					)}
				</div>
			)}
			<DialogFooter>
				<Button type="submit" disabled={!valid || isProcessing}>
					{isProcessing ? "Recording..." : "Record cash"}
				</Button>
			</DialogFooter>
		</form>
	);
}
