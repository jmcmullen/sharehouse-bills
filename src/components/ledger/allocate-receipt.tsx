import { useState } from "react";
import { toast } from "sonner";
import type { AccountPayments } from "../../api/services/ledger/account-payments";
import {
	allocateLedgerReceipt,
	recordLedgerReceipt,
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
import { AllocationIssue } from "./bill-payments";
import { ledgerDate, ledgerMoney, ledgerTime } from "./statement";

export function AllocateReceipt(props: {
	housemateId: string;
	receiptId: string;
	billing: AccountPayments;
	onClose: () => void;
	onSaved: () => Promise<void>;
}) {
	const receipt = props.billing.receipts.find(
		(item) => item.id === props.receiptId,
	);
	const [amounts, setAmounts] = useState<Record<string, string>>(() =>
		Object.fromEntries(
			(receipt?.allocations ?? []).map((item) => [
				item.debtId,
				String(item.amountCents / 100),
			]),
		),
	);
	const [busy, setBusy] = useState(false);
	if (!receipt) return null;
	const allocations = Object.entries(amounts)
		.filter(([, amount]) => Number(amount) > 0)
		.map(([debtId, amount]) => ({
			debtId,
			amountCents: Math.round(Number(amount) * 100),
		}));
	const remaining =
		receipt.amountCents -
		allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0);
	async function save() {
		setBusy(true);
		try {
			await allocateLedgerReceipt({
				data: {
					housemateId: props.housemateId,
					receiptId: props.receiptId,
					allocations,
					expectedRevision: props.billing.revision,
				},
			});
			await props.onSaved();
			props.onClose();
			toast.success("Bill allocations saved. Money received is unchanged.");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not allocate payment",
			);
		} finally {
			setBusy(false);
		}
	}
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !busy) props.onClose();
			}}
		>
			<DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>
						Payment of {ledgerMoney(receipt.amountCents)}
					</DialogTitle>
					<DialogDescription>
						{receipt.description} ·{" "}
						{receipt.receivedDateKnown ? "Received" : "Recorded"}{" "}
						{ledgerTime(receipt.receivedAt)}
					</DialogDescription>
				</DialogHeader>
				<p className="text-sm">
					{receipt.bankMatched
						? "Bank matched. This receipt counts once."
						: "Recorded manually. This money already counts as received."}{" "}
					Choose which bills it covers.
				</p>
				{receipt.manual && (
					<p className="text-muted-foreground text-xs">
						Recorded {ledgerTime(receipt.recordedAt)}
					</p>
				)}
				<AllocationIssue reason={receipt.allocationIssue} />
				<form
					className="space-y-4"
					onSubmit={(event) => {
						event.preventDefault();
						void save();
					}}
				>
					{props.billing.bills
						.filter(
							(bill) =>
								(!receipt.rentOnly || /rent/i.test(bill.category)) &&
								(bill.remainingCents > 0 ||
									receipt.allocations.some((item) => item.debtId === bill.id)),
						)
						.map((bill) => (
							<label
								htmlFor={`allocation-${bill.id}`}
								key={bill.id}
								className="flex items-center justify-between gap-4 border-b pb-3"
							>
								<span className="text-sm">
									{bill.name}
									<span className="mt-1 block text-muted-foreground text-xs">
										{bill.dueAt ? ledgerDate(bill.dueAt) : "No due date"} ·
										Share {ledgerMoney(bill.amountCents)}
									</span>
								</span>
								<Input
									id={`allocation-${bill.id}`}
									className="w-28"
									type="number"
									min="0"
									step="0.01"
									max={bill.amountCents / 100}
									aria-label={`Allocate to ${bill.name} ${bill.dueAt ? ledgerDate(bill.dueAt) : bill.id}`}
									value={amounts[bill.id] ?? ""}
									placeholder="0.00"
									disabled={busy}
									onChange={(event) =>
										setAmounts({ ...amounts, [bill.id]: event.target.value })
									}
								/>
							</label>
						))}
					<p className={remaining < 0 ? "text-destructive" : "text-sm"}>
						Unallocated after saving: {ledgerMoney(remaining)}
					</p>
					<div className="flex gap-2">
						<Button type="submit" disabled={busy || remaining < 0}>
							{busy ? "Saving…" : "Save allocations"}
						</Button>
						<Button
							type="button"
							variant="outline"
							onClick={props.onClose}
							disabled={busy}
						>
							Cancel
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export function RecordReceipt(props: {
	housemateId: string;
	name: string;
	revision: string;
	onClose: () => void;
	onSaved: () => Promise<void>;
}) {
	const [amount, setAmount] = useState("");
	const [description, setDescription] = useState("");
	const [date, setDate] = useState(() =>
		new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
			.toISOString()
			.slice(0, 16),
	);
	const [busy, setBusy] = useState(false);
	const [needsConfirmation, setNeedsConfirmation] = useState(false);
	const [confirmedSeparate, setConfirmedSeparate] = useState(false);
	async function save() {
		setBusy(true);
		try {
			await recordLedgerReceipt({
				data: {
					confirmedSeparate,
					housemateId: props.housemateId,
					amountCents: Math.round(Number(amount) * 100),
					description,
					receivedAt: Math.floor(new Date(date).getTime() / 1000),
					expectedRevision: props.revision,
				},
			});
			await props.onSaved();
			props.onClose();
			toast.success("Money recorded. Choose its bills under Money received.");
		} catch (error) {
			if (
				error instanceof Error &&
				error.message.includes("already be recorded")
			)
				setNeedsConfirmation(true);
			toast.error(
				error instanceof Error ? error.message : "Could not record payment",
			);
		} finally {
			setBusy(false);
		}
	}
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !busy) props.onClose();
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Record money from {props.name}</DialogTitle>
					<DialogDescription>
						Use this only for money you received that is not already listed. If
						it is listed, choose its bills under Money received.
					</DialogDescription>
				</DialogHeader>
				<form
					className="space-y-4"
					onSubmit={(event) => {
						event.preventDefault();
						void save();
					}}
				>
					<label htmlFor="receipt-amount" className="block space-y-2 text-sm">
						<span>Amount received</span>
						<Input
							id="receipt-amount"
							required
							type="number"
							min="0.01"
							step="0.01"
							value={amount}
							onChange={(event) => setAmount(event.target.value)}
							disabled={busy}
						/>
					</label>
					<label htmlFor="receipt-date" className="block space-y-2 text-sm">
						<span>Received date and time</span>
						<Input
							id="receipt-date"
							required
							type="datetime-local"
							value={date}
							onChange={(event) => setDate(event.target.value)}
							disabled={busy}
						/>
					</label>
					<label
						htmlFor="receipt-description"
						className="block space-y-2 text-sm"
					>
						<span>What was it for?</span>
						<Input
							id="receipt-description"
							required
							value={description}
							maxLength={200}
							placeholder="Rent, cleaning, bills…"
							onChange={(event) => setDescription(event.target.value)}
							disabled={busy}
						/>
					</label>
					{needsConfirmation && (
						<label className="flex items-start gap-3 text-sm">
							<input
								type="checkbox"
								checked={confirmedSeparate}
								disabled={busy}
								onChange={(event) => setConfirmedSeparate(event.target.checked)}
							/>
							<span>
								I checked the existing receipts. This is additional money
								received.
							</span>
						</label>
					)}
					<Button
						type="submit"
						disabled={busy || (needsConfirmation && !confirmedSeparate)}
					>
						{busy ? "Saving…" : "Confirm money received"}
					</Button>
				</form>
			</DialogContent>
		</Dialog>
	);
}
