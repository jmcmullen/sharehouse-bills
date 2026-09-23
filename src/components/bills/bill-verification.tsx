import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type {
	BillShare,
	BillVerification,
	BillVerificationStatus,
	BillVerificationSummary,
	ShareReceipt,
	VerifiedBill,
} from "../../api/services/ledger/bill-verification";
import { ledgerDate, ledgerMoney } from "../ledger/statement";

const statusLabel: Record<BillVerificationStatus, string> = {
	paid: "Paid",
	part: "Part paid",
	unpaid: "Unpaid",
	check: "Needs check",
};
const statusVariant: Record<
	BillVerificationStatus,
	"default" | "secondary" | "outline" | "destructive"
> = {
	paid: "secondary",
	part: "outline",
	unpaid: "outline",
	check: "destructive",
};

export function BillVerificationSection({ data }: { data: BillVerification }) {
	const [filter, setFilter] = useState<"all" | "check">("check");
	if (!data.available)
		return (
			<section className="space-y-2" aria-label="Payment verification">
				<h2 className="font-semibold text-xl">Payment verification</h2>
				<p className="rounded-xl border p-4 text-muted-foreground text-sm">
					The housemate ledger is not installed yet, so payments cannot be
					verified against bills.
				</p>
			</section>
		);
	const bills = data.bills.filter(
		(bill) => filter === "all" || bill.status !== "paid",
	);
	return (
		<section className="space-y-4" aria-label="Payment verification">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<h2 className="font-semibold text-xl">Payment verification</h2>
					<p className="text-muted-foreground text-sm">
						Which payments cover each bill, per housemate share.
					</p>
				</div>
				<div className="flex gap-2">
					<Button
						variant={filter === "check" ? "default" : "outline"}
						size="sm"
						aria-pressed={filter === "check"}
						onClick={() => setFilter("check")}
					>
						Needs verification
					</Button>
					<Button
						variant={filter === "all" ? "default" : "outline"}
						size="sm"
						aria-pressed={filter === "all"}
						onClick={() => setFilter("all")}
					>
						All
					</Button>
				</div>
			</div>
			<SummaryStrip summary={data.summary} />
			<div className="divide-y rounded-xl border">
				{bills.map((bill) => (
					<BillRow key={bill.id} bill={bill} />
				))}
				{bills.length === 0 && (
					<p className="p-6 text-muted-foreground text-sm">
						{filter === "all"
							? "No bills in the ledger yet."
							: "Every bill is fully paid and verified."}
					</p>
				)}
			</div>
		</section>
	);
}

function SummaryStrip({ summary }: { summary: BillVerificationSummary }) {
	const items: Array<[string, string]> = [
		["Paid", String(summary.paid)],
		["Part paid", String(summary.part)],
		["Unpaid", String(summary.unpaid)],
		["Needs check", String(summary.check)],
		["Remaining", ledgerMoney(summary.remainingCents)],
	];
	return (
		<dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-5">
			{items.map(([label, value]) => (
				<div key={label} className="bg-card px-4 py-3">
					<dt className="text-muted-foreground text-xs">{label}</dt>
					<dd className="font-semibold tabular-nums">{value}</dd>
				</div>
			))}
		</dl>
	);
}

function BillRow({ bill }: { bill: VerifiedBill }) {
	return (
		<details className="group p-4">
			<summary className="cursor-pointer list-none">
				<div className="grid grid-cols-3 items-center gap-x-4 gap-y-3 sm:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr]">
					<div className="col-span-3 flex flex-wrap items-center gap-2 sm:col-span-1">
						<div className="min-w-0">
							<p className="truncate font-medium">{bill.name}</p>
							<p className="mt-1 text-muted-foreground text-xs">
								{bill.dueAt ? `Due ${ledgerDate(bill.dueAt)}` : "No due date"} ·{" "}
								{bill.category} · {bill.shares.length}{" "}
								{bill.shares.length === 1 ? "share" : "shares"}
							</p>
						</div>
						<Badge variant={statusVariant[bill.status]}>
							{statusLabel[bill.status]}
						</Badge>
					</div>
					<Amount label="Total" cents={bill.amountCents} />
					<Amount label="Paid" cents={bill.paidCents} />
					<Amount label="Remaining" cents={bill.remainingCents} />
				</div>
			</summary>
			<div className="mt-4 divide-y border-t">
				{bill.shares.map((share) => (
					<ShareRow key={share.debtId} share={share} />
				))}
			</div>
		</details>
	);
}

function ShareRow({ share }: { share: BillShare }) {
	return (
		<div className="space-y-3 py-4 text-sm">
			<div className="grid grid-cols-3 items-center gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr]">
				<div className="col-span-3 flex items-center justify-between gap-3 sm:col-span-1">
					<p className="font-medium">{share.housemateName}</p>
					<Button asChild variant="link" size="sm" className="h-auto p-0">
						<Link to="/ledger">Open ledger</Link>
					</Button>
				</div>
				<Amount label="Share" cents={share.amountCents} />
				<Amount label="Paid" cents={share.paidCents} />
				<Amount label="Remaining" cents={share.remainingCents} />
			</div>
			{share.mismatch && (
				<p className="rounded-lg border border-destructive/40 px-3 py-2 text-xs">
					Previously marked paid {ledgerMoney(share.legacyPaidCents)} in the old
					system. Allocated payments total {ledgerMoney(share.paidCents)}.
				</p>
			)}
			{share.paidCents > share.amountCents && (
				<p className="rounded-lg border border-destructive/40 px-3 py-2 text-xs">
					Allocated payments exceed this share.
				</p>
			)}
			<ul className="space-y-2">
				{share.receipts.map((receipt) => (
					<ReceiptLine key={receipt.receiptId} receipt={receipt} />
				))}
				{share.receipts.length === 0 && (
					<li className="text-muted-foreground text-xs">
						No payment allocated to this share yet.
					</li>
				)}
			</ul>
		</div>
	);
}

function ReceiptLine({ receipt }: { receipt: ShareReceipt }) {
	return (
		<li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
			<span className="min-w-0">
				<span className="font-medium tabular-nums">
					{ledgerMoney(receipt.amountCents)}
				</span>{" "}
				<span className="text-muted-foreground">· {receipt.description}</span>
			</span>
			<span className="flex items-center gap-2 text-muted-foreground text-xs">
				<span className="tabular-nums">
					{receipt.receivedDateKnown
						? ledgerDate(receipt.receivedAt)
						: "Date unknown"}
				</span>
				<Badge variant={receipt.bankMatched ? "secondary" : "outline"}>
					{receipt.bankMatched ? "Bank matched" : "Manual · bank match pending"}
				</Badge>
			</span>
		</li>
	);
}

function Amount({ label, cents }: { label: string; cents: number }) {
	return (
		<div className="text-right sm:text-left">
			<p className="text-muted-foreground text-xs">{label}</p>
			<p className="tabular-nums">{ledgerMoney(cents)}</p>
		</div>
	);
}
