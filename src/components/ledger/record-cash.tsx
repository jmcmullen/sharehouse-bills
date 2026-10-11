import { formatCents, parseCents } from "@/lib/money";
import { useState } from "react";
import { toast } from "sonner";
import type { AccountPayments } from "../../api/services/payments/account-payments";
import { isRentReference } from "../../api/services/payments/model";
import { fillOldestFirst } from "../../api/services/payments/suggestions";
import { recordCashReceived } from "../../functions/ledger";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
	type Amounts,
	BillAllocationFields,
	allocationsFrom,
	amountsFrom,
} from "./allocation-fields";

// Cash handed over by one housemate, recorded once and spread over their open
// bills oldest due first until the admin changes the split.
export function RecordCash(props: {
	housemateId: string;
	housemateName: string;
	billing: AccountPayments;
	onClose: () => void;
	onSaved: () => Promise<void>;
}) {
	const today = localDate(new Date());
	const [amount, setAmount] = useState("");
	const [date, setDate] = useState(today);
	const [note, setNote] = useState("");
	const [edited, setEdited] = useState<Amounts | null>(null);
	const [busy, setBusy] = useState(false);
	const amountCents = parseCents(amount);
	const rentOnly = isRentReference(note);
	const amounts =
		edited ?? propose(props.billing.bills, amountCents ?? 0, rentOnly);
	const allocations = allocationsFrom(amounts);
	const unallocated =
		(amountCents ?? 0) -
		allocations.reduce((sum, item) => sum + item.amountCents, 0);
	const valid =
		amountCents !== null &&
		amountCents > 0 &&
		unallocated >= 0 &&
		date !== "" &&
		date <= today;
	async function save() {
		if (!valid || amountCents === null) return;
		setBusy(true);
		try {
			await recordCashReceived({
				data: {
					housemateId: props.housemateId,
					amountCents,
					receivedAt: receivedAt(date, today),
					note: note.trim(),
					allocations,
					expectedRevision: props.billing.revision,
				},
			});
			await props.onSaved();
			props.onClose();
			toast.success(
				`Cash of ${formatCents(amountCents)} recorded. ${props.housemateName} gets a receipt.`,
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not record cash",
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
					<DialogTitle>Record cash from {props.housemateName}</DialogTitle>
					<DialogDescription>
						Enter the cash once. It covers the oldest bills first unless you
						change the split, and {props.housemateName} gets a receipt.
					</DialogDescription>
				</DialogHeader>
				<form
					className="space-y-5"
					onSubmit={(event) => {
						event.preventDefault();
						void save();
					}}
				>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="cash-amount">Amount</Label>
							<Input
								id="cash-amount"
								inputMode="decimal"
								placeholder="0.00"
								value={amount}
								disabled={busy}
								onChange={(event) => setAmount(event.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="cash-date">Received on</Label>
							<Input
								id="cash-date"
								type="date"
								max={today}
								value={date}
								disabled={busy}
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
							disabled={busy}
							onChange={(event) => setNote(event.target.value)}
						/>
						{rentOnly && (
							<p className="text-muted-foreground text-xs">
								The note mentions rent, so this cash can only cover rent bills.
							</p>
						)}
					</div>
					<div className="space-y-3">
						<div className="flex items-center justify-between gap-2">
							<h3 className="font-medium text-sm">Bills it covers</h3>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								disabled={busy || edited === null}
								onClick={() => setEdited(null)}
							>
								Reset to oldest first
							</Button>
						</div>
						<BillAllocationFields
							bills={props.billing.bills}
							rentOnly={rentOnly}
							kept={[]}
							amounts={amounts}
							busy={busy}
							onChange={setEdited}
						/>
						<output
							className={
								unallocated < 0
									? "block text-destructive text-sm"
									: "block text-sm"
							}
						>
							{unallocated < 0
								? `${formatCents(-unallocated)} more than the cash received. Reduce the bills to save.`
								: unallocated > 0
									? `${formatCents(unallocated)} held as credit`
									: "All of the cash is allocated."}
						</output>
					</div>
					<div className="flex flex-col-reverse gap-2 sm:flex-row">
						<Button
							type="button"
							variant="outline"
							onClick={props.onClose}
							disabled={busy}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={busy || !valid}>
							{busy ? "Recording…" : "Record cash"}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function propose(
	bills: AccountPayments["bills"],
	amountCents: number,
	rentOnly: boolean,
): Amounts {
	return amountsFrom(
		fillOldestFirst(
			bills
				.filter((bill) => !rentOnly || /rent/i.test(bill.category))
				.map((bill) => ({
					debtId: bill.id,
					billName: bill.name,
					category: bill.category,
					dueAt: bill.dueAt,
					remainingCents: bill.remainingCents,
				})),
			amountCents,
		),
	);
}

function localDate(date: Date): string {
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Cash taken today is recorded now; an earlier day is recorded at its midday,
// so the date never shifts across a timezone boundary.
function receivedAt(date: string, today: string): number {
	return date === today
		? Math.floor(Date.now() / 1000)
		: Math.floor(new Date(`${date}T12:00:00`).getTime() / 1000);
}
