import { useState } from "react";
import { reviewHint } from "../../api/services/ledger/review-policy";
import type { getPaymentReview } from "../../functions/ledger";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import { SinglePaymentReview } from "./single-payment-review";
import { SplitPayment } from "./split-payment";
import { ledgerMoney, ledgerTime } from "./statement";

export type Ready = Extract<
	Awaited<ReturnType<typeof getPaymentReview>>,
	{ available: true }
>;
export type Payment = Ready["reviews"][number];

export function paymentEligible(payment: Payment): boolean {
	return (
		payment.bankStatus === "SETTLED" &&
		payment.currency === "AUD" &&
		!payment.internalTransfer &&
		!["Interest", "Refund"].includes(payment.transactionType)
	);
}

export function ReviewPayment({
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
	const [busy, setBusy] = useState(false);
	const [split, setSplit] = useState(payment.allocations.length > 1);
	const eligible = paymentEligible(payment);
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !busy) onClose();
			}}
		>
			<DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>
						{payment.amountCents < 0 ? "Money sent" : "Payment received"} ·{" "}
						{ledgerMoney(Math.abs(payment.amountCents))}
					</DialogTitle>
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
					<p className="mt-3 text-muted-foreground">
						{payment.decision === "review"
							? reviewHint(payment)
							: payment.reason}
					</p>
				</div>
				{eligible && payment.amountCents > 0 && (
					<div className="flex gap-2">
						<Button
							variant={!split ? "secondary" : "ghost"}
							aria-pressed={!split}
							onClick={() => setSplit(false)}
							disabled={busy}
						>
							One housemate
						</Button>
						<Button
							variant={split ? "secondary" : "ghost"}
							aria-pressed={split}
							onClick={() => setSplit(true)}
							disabled={busy}
						>
							Split payment
						</Button>
					</div>
				)}
				{split && eligible ? (
					<SplitPayment
						payment={payment}
						accounts={data.accounts}
						onSaved={async () => {
							await onSaved();
							onClose();
						}}
						onBusy={setBusy}
					/>
				) : (
					<SinglePaymentReview
						payment={payment}
						data={data}
						eligible={eligible}
						onClose={onClose}
						onSaved={onSaved}
						onBusy={setBusy}
					/>
				)}
				<Button variant="ghost" disabled={busy} onClick={onClose}>
					Close
				</Button>
				<details className="break-all text-muted-foreground text-xs">
					<summary>Bank details and decision</summary>
					<p>{payment.reason}</p>
					<p>{payment.id}</p>
				</details>
			</DialogContent>
		</Dialog>
	);
}
