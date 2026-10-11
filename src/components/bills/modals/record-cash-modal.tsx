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
import { formatCents, formatDecimal, parseCents } from "@/lib/money";
import { useState } from "react";
import type { BillListItem, CashReceiptData } from "../types";

interface RecordCashModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	bill: BillListItem | null;
	onConfirm: (data: CashReceiptData) => void;
	isProcessing: boolean;
}

function today() {
	return new Date().toLocaleDateString("en-CA");
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
					key={bill.id}
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
	bill: BillListItem;
}) {
	const shares = bill.shares.filter((share) => share.remainingCents > 0);
	const [debtId, setDebtId] = useState(shares[0]?.id ?? "");
	const share = shares.find((item) => item.id === debtId);
	const remaining = share?.remainingCents ?? 0;
	const [amount, setAmount] = useState(formatDecimal(remaining));
	const [date, setDate] = useState(today());
	const [note, setNote] = useState("");
	const amountCents = parseCents(amount) ?? 0;
	const valid =
		Boolean(share) &&
		amountCents > 0 &&
		amountCents <= remaining &&
		date.length > 0;

	function choose(id: string) {
		setDebtId(id);
		const next = shares.find((item) => item.id === id);
		setAmount(next ? formatDecimal(next.remainingCents) : "");
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
					Cash for <span className="font-semibold">{bill.billerName}</span> is
					applied to the share straight away and the housemate gets a receipt.
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
							{shares.map((item) => (
								<option key={item.id} value={item.id}>
									{item.housemateName} · {formatCents(item.remainingCents)}{" "}
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
								max={formatDecimal(remaining)}
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
							Cash cannot exceed the {formatCents(remaining)} remaining on this
							share.
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
