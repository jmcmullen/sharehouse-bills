import { formatCents } from "@/lib/money";
import { useState } from "react";
import { toast } from "sonner";
import type { AccountPayments } from "../../api/services/payments/account-payments";
import { allocateLedgerReceipt } from "../../functions/ledger";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import {
	type Amounts,
	BillAllocationFields,
	allocationsFrom,
	amountsFrom,
} from "./allocation-fields";
import { ledgerTime } from "./dates";

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
	const [amounts, setAmounts] = useState<Amounts>(() =>
		amountsFrom(receipt?.allocations ?? []),
	);
	const [busy, setBusy] = useState(false);
	if (!receipt) return null;
	const allocations = allocationsFrom(amounts);
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
						Payment of {formatCents(receipt.amountCents)}
					</DialogTitle>
					<DialogDescription>
						{receipt.description} · Received {ledgerTime(receipt.receivedAt)}
					</DialogDescription>
				</DialogHeader>
				<p className="text-sm">
					{receipt.kind === "bank"
						? "Bank transfer. This receipt counts once."
						: "Cash received. This money already counts as received."}{" "}
					Choose which bills it covers.
				</p>
				{receipt.kind === "cash" && (
					<p className="text-muted-foreground text-xs">
						Recorded {ledgerTime(receipt.recordedAt)}
					</p>
				)}
				<form
					className="space-y-4"
					onSubmit={(event) => {
						event.preventDefault();
						void save();
					}}
				>
					<BillAllocationFields
						bills={props.billing.bills}
						rentOnly={receipt.rentOnly}
						kept={receipt.allocations.map((item) => item.debtId)}
						amounts={amounts}
						busy={busy}
						onChange={setAmounts}
					/>
					<p className={remaining < 0 ? "text-destructive" : "text-sm"}>
						Unallocated after saving: {formatCents(remaining)}
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
