import { useState } from "react";
import type {
	AccountPayments,
	BillPaymentView,
	ReceiptView,
} from "../../api/services/ledger/account-payments";
import { Button } from "../ui/button";
import { ledgerDate, ledgerMoney, ledgerTime } from "./statement";

type VisibleReceipt = Omit<ReceiptView, "sourceKeys">;
type VisibleAccount = Omit<AccountPayments, "revision" | "receipts"> & {
	receipts: VisibleReceipt[];
};

export function BillPayments(props: {
	billing: VisibleAccount;
	onAllocate?: (receiptId: string) => void;
}) {
	const [tab, setTab] = useState("bills");
	const [filter, setFilter] = useState("all");
	const bills = props.billing.bills.filter(
		(bill) =>
			filter === "all" ||
			(filter === "unpaid"
				? bill.remainingCents > 0
				: bill.remainingCents === 0),
	);
	return (
		<section className="space-y-4" aria-label="Bills and received payments">
			<div className="flex flex-wrap items-center gap-2">
				<Button
					variant={tab === "bills" ? "default" : "outline"}
					aria-pressed={tab === "bills"}
					onClick={() => setTab("bills")}
				>
					Bills
				</Button>
				<Button
					variant={tab === "payments" ? "default" : "outline"}
					aria-pressed={tab === "payments"}
					onClick={() => setTab("payments")}
				>
					Money received
				</Button>
				{tab === "bills" && (
					<select
						className="ml-auto h-10 rounded-md border bg-background px-3 text-sm"
						aria-label="Bill payment status"
						value={filter}
						onChange={(event) => setFilter(event.target.value)}
					>
						<option value="all">All bills</option>
						<option value="unpaid">Unpaid or part paid</option>
						<option value="paid">Paid</option>
					</select>
				)}
			</div>
			<p className="text-muted-foreground text-sm">
				A payment counts once. Matching bank evidence confirms money already
				recorded. Unallocated money stays available until assigned to a bill.
			</p>
			{props.billing.allocationReviewCount > 0 && (
				<p className="rounded-lg border border-amber-500/40 p-3 text-sm">
					{props.billing.allocationReviewCount} bill records need allocation
					checks. Their earlier paid amounts are shown below for comparison.
				</p>
			)}
			{tab === "bills" ? (
				<div className="divide-y rounded-xl border">
					{bills.map((bill) => (
						<BillRow
							key={bill.id}
							bill={bill}
							receipts={props.billing.receipts}
							onAllocate={props.onAllocate}
						/>
					))}
					{bills.length === 0 && (
						<p className="p-6 text-muted-foreground">No bills in this view.</p>
					)}
				</div>
			) : (
				<div className="space-y-3">
					{props.billing.receipts.map((receipt) => (
						<ReceiptRow
							key={receipt.id}
							receipt={receipt}
							bills={props.billing.bills}
							onAllocate={props.onAllocate}
						/>
					))}
					{props.billing.receipts.length === 0 && (
						<p className="p-6 text-muted-foreground">No payments recorded.</p>
					)}
				</div>
			)}
		</section>
	);
}

function billStatus(bill: BillPaymentView): string {
	if (
		bill.paidCents > bill.amountCents ||
		bill.paidCents < 0 ||
		bill.legacyPaidCents > bill.paidCents
	)
		return "Check allocation";
	if (bill.remainingCents === 0) return "Paid";
	return bill.paidCents > 0 ? "Part paid" : "Unpaid";
}

function BillRow(props: {
	bill: BillPaymentView;
	receipts: VisibleReceipt[];
	onAllocate?: (id: string) => void;
}) {
	return (
		<details className="p-4">
			<summary className="cursor-pointer list-none">
				<div className="grid grid-cols-3 items-center gap-x-4 gap-y-3 sm:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr]">
					<div className="col-span-3 sm:col-span-1">
						<p className="font-medium">{props.bill.name}</p>
						<p className="mt-1 text-muted-foreground text-xs">
							{props.bill.dueAt ? ledgerDate(props.bill.dueAt) : "No due date"}{" "}
							· {billStatus(props.bill)} · Details
						</p>
					</div>
					<Amount label="Share" amount={props.bill.amountCents} />
					<Amount label="Paid" amount={props.bill.paidCents} />
					<Amount label="Remaining" amount={props.bill.remainingCents} />
				</div>
			</summary>
			<div className="mt-4 space-y-3 border-t pt-4 text-sm">
				{props.bill.legacyPaidCents > props.bill.paidCents && (
					<p className="text-amber-700 dark:text-amber-300">
						Previously marked paid: {ledgerMoney(props.bill.legacyPaidCents)}.
						The difference still needs supporting payment allocations.
					</p>
				)}
				{props.bill.payments.map((payment) => {
					const receipt = props.receipts.find(
						(item) => item.id === payment.receiptId,
					);
					if (!receipt) return null;
					return (
						<div
							key={payment.receiptId}
							className="flex flex-wrap items-center justify-between gap-3"
						>
							<div>
								<p>
									{ledgerMoney(payment.amountCents)} · {receipt.description}
								</p>
								<p className="mt-1 text-muted-foreground text-xs">
									{receipt.bankMatched
										? "Bank matched"
										: "Recorded manually · bank match pending"}{" "}
									· {ledgerDate(receipt.receivedAt)}
								</p>
								<AllocationIssue reason={receipt.allocationIssue} />
							</div>
							{props.onAllocate && (
								<Button
									variant="outline"
									size="sm"
									onClick={() => props.onAllocate?.(receipt.id)}
								>
									View payment
								</Button>
							)}
						</div>
					);
				})}
				{props.bill.payments.length === 0 && (
					<p className="text-muted-foreground">
						No payment allocated yet. Choose a receipt in Money received to
						cover this bill.
					</p>
				)}
			</div>
		</details>
	);
}

function ReceiptRow(props: {
	receipt: VisibleReceipt;
	bills: BillPaymentView[];
	onAllocate?: (id: string) => void;
}) {
	return (
		<details className="rounded-xl border p-4">
			<summary className="flex cursor-pointer list-none items-start justify-between gap-4">
				<div>
					<p className="font-medium">{props.receipt.description}</p>
					<p className="mt-1 text-muted-foreground text-xs">
						{ledgerDate(props.receipt.receivedAt)} ·{" "}
						{props.receipt.bankMatched
							? "Bank matched"
							: "Recorded manually · bank match pending"}
					</p>
					<AllocationIssue reason={props.receipt.allocationIssue} />
				</div>
				<span className="whitespace-nowrap font-semibold tabular-nums">
					{ledgerMoney(props.receipt.amountCents)}
				</span>
			</summary>
			<div className="mt-4 space-y-3 border-t pt-4 text-sm">
				<p>
					{props.receipt.receivedDateKnown ? "Received" : "Recorded"}{" "}
					{ledgerTime(props.receipt.receivedAt)}
				</p>
				{props.receipt.manual && (
					<p className="text-muted-foreground">
						Recorded manually {ledgerTime(props.receipt.recordedAt)}.{" "}
						{props.receipt.bankMatched
							? "The bank transfer confirms this same payment."
							: "This money already counts as received."}
					</p>
				)}
				{props.receipt.allocations.map((allocation) => (
					<p key={allocation.debtId} className="flex justify-between gap-3">
						<span>
							{props.bills.find((bill) => bill.id === allocation.debtId)
								?.name ?? "Removed bill"}
						</span>
						<span>{ledgerMoney(allocation.amountCents)}</span>
					</p>
				))}
				<p className="flex justify-between gap-3 font-medium">
					<span>Unallocated</span>
					<span>{ledgerMoney(props.receipt.unallocatedCents)}</span>
				</p>
				{props.onAllocate && props.receipt.amountCents > 0 && (
					<Button
						variant="outline"
						onClick={() => props.onAllocate?.(props.receipt.id)}
					>
						Choose bills for this payment
					</Button>
				)}
			</div>
		</details>
	);
}

export function AllocationIssue(props: { reason: string | null }) {
	if (!props.reason) return null;
	return (
		<p className="mt-1 text-amber-700 text-xs dark:text-amber-300">
			Check allocation · {props.reason}
		</p>
	);
}

function Amount(props: { label: string; amount: number }) {
	return (
		<div>
			<p className="text-muted-foreground text-xs">{props.label}</p>
			<p className="mt-1 font-medium tabular-nums">
				{ledgerMoney(props.amount)}
			</p>
		</div>
	);
}

export function PaymentSummary(props: {
	balanceCents: number;
	unpaidCents: number;
	unallocatedCents: number;
}) {
	return (
		<div className="grid gap-3 sm:grid-cols-3">
			{[
				{
					label: props.balanceCents < 0 ? "Net credit" : "Net amount owed",
					value: Math.abs(props.balanceCents),
				},
				{ label: "Unpaid bill shares", value: props.unpaidCents },
				{ label: "Unallocated money", value: props.unallocatedCents },
			].map((item) => (
				<div key={item.label} className="rounded-xl border bg-card p-4">
					<p className="text-muted-foreground text-sm">{item.label}</p>
					<p className="mt-2 font-semibold text-2xl tabular-nums">
						{ledgerMoney(item.value)}
					</p>
				</div>
			))}
		</div>
	);
}
