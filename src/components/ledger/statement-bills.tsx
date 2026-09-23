import { useState } from "react";
import type { PrivateBilling } from "../../api/services/ledger/statement-access";
import { Button } from "../ui/button";
import { ledgerDate, ledgerMoney } from "./statement";

type Bill = PrivateBilling["bills"][number];
type Receipt = PrivateBilling["receipts"][number];

function status(bill: Bill): string {
	if (bill.paidCents > bill.amountCents || bill.paidCents < 0)
		return "Being checked";
	if (bill.remainingCents === 0) return "Paid";
	return bill.paidCents > 0 ? "Part paid" : "Unpaid";
}

// The housemate's view of each bill share: what it was, what has covered it
// and what is left, matching the receipt messages they were sent.
export function StatementBills({ billing }: { billing: PrivateBilling }) {
	const [showPaid, setShowPaid] = useState(false);
	const bills = billing.bills.filter(
		(bill) => showPaid || bill.remainingCents > 0,
	);
	const paidCount = billing.bills.length - bills.length;
	return (
		<section className="space-y-4" aria-label="Your bills">
			<div className="flex flex-wrap items-baseline justify-between gap-3">
				<h2 className="font-semibold text-lg">Your bills</h2>
				<p className="text-muted-foreground text-sm">
					{billing.unpaidCents > 0
						? `${ledgerMoney(billing.unpaidCents)} still to cover`
						: "Every share is covered"}
				</p>
			</div>
			<div className="divide-y rounded-xl border bg-card">
				{bills.map((bill) => (
					<BillCard key={bill.id} bill={bill} receipts={billing.receipts} />
				))}
				{bills.length === 0 && (
					<p className="p-6 text-center text-muted-foreground text-sm">
						Nothing unpaid right now.
					</p>
				)}
			</div>
			{(paidCount > 0 || showPaid) && (
				<Button
					variant="outline"
					className="w-full"
					onClick={() => setShowPaid(!showPaid)}
				>
					{showPaid
						? "Hide paid bills"
						: `Show ${paidCount} paid bill${paidCount === 1 ? "" : "s"}`}
				</Button>
			)}
		</section>
	);
}

function BillCard(props: { bill: Bill; receipts: Receipt[] }) {
	const { bill } = props;
	const covered = bill.payments.flatMap((payment) => {
		const receipt = props.receipts.find(
			(item) => item.id === payment.receiptId,
		);
		return receipt ? [{ ...payment, receipt }] : [];
	});
	return (
		<article className="space-y-3 p-4 sm:p-5">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="break-words font-medium">{bill.name}</p>
					<p className="mt-1 text-muted-foreground text-xs">
						{bill.dueAt ? `Due ${ledgerDate(bill.dueAt)}` : "No due date"}
					</p>
				</div>
				<span
					className={
						bill.remainingCents === 0
							? "shrink-0 rounded-full bg-success/10 px-2.5 py-0.5 font-medium text-success text-xs"
							: "shrink-0 rounded-full bg-muted px-2.5 py-0.5 font-medium text-xs"
					}
				>
					{status(bill)}
				</span>
			</div>
			<dl className="grid grid-cols-3 gap-3 text-sm">
				<Amount label="Share" cents={bill.amountCents} />
				<Amount label="Paid" cents={bill.paidCents} />
				<Amount label="Remaining" cents={bill.remainingCents} />
			</dl>
			{covered.length > 0 && (
				<ul className="space-y-1 border-t pt-3 text-sm">
					{covered.map((item) => (
						<li
							key={item.receiptId}
							className="flex justify-between gap-3 text-muted-foreground"
						>
							<span>
								{item.receipt.description} ·{" "}
								{ledgerDate(item.receipt.receivedAt)}
							</span>
							<span className="tabular-nums">
								{ledgerMoney(item.amountCents)}
							</span>
						</li>
					))}
				</ul>
			)}
		</article>
	);
}

function Amount(props: { label: string; cents: number }) {
	return (
		<div>
			<dt className="text-muted-foreground text-xs">{props.label}</dt>
			<dd className="mt-1 font-medium tabular-nums">
				{ledgerMoney(props.cents)}
			</dd>
		</div>
	);
}

export function MoneyReceived({ billing }: { billing: PrivateBilling }) {
	if (!billing.receipts.length) return null;
	return (
		<details className="rounded-lg border p-4">
			<summary className="cursor-pointer text-sm">
				Money received ({billing.receipts.length})
			</summary>
			<ul className="mt-3 divide-y text-sm">
				{billing.receipts.map((receipt) => (
					<li key={receipt.id} className="space-y-1 py-3">
						<div className="flex justify-between gap-3">
							<span>
								{receipt.description} · {ledgerDate(receipt.receivedAt)}
							</span>
							<span className="font-medium tabular-nums">
								{ledgerMoney(receipt.amountCents)}
							</span>
						</div>
						{receipt.allocations.map((allocation) => (
							<p
								key={allocation.debtId}
								className="flex justify-between gap-3 text-muted-foreground text-xs"
							>
								<span>
									{billing.bills.find((bill) => bill.id === allocation.debtId)
										?.name ?? "Removed bill"}
								</span>
								<span className="tabular-nums">
									{ledgerMoney(allocation.amountCents)}
								</span>
							</p>
						))}
						{receipt.unallocatedCents > 0 && (
							<p className="text-muted-foreground text-xs">
								{ledgerMoney(receipt.unallocatedCents)} waiting to be applied to
								a bill
							</p>
						)}
					</li>
				))}
			</ul>
		</details>
	);
}
