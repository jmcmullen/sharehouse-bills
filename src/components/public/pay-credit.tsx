import { formatCurrency } from "@/lib/share-preview";

export const SECTION_LABEL_CLASS =
	"font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.12em]";

interface CoveredBill {
	billId: string;
	billerName: string;
	billPath: string;
	amount: number;
	secondary: string | null;
}

interface PayCredit {
	heldAmount: number;
	appliedAmount: number;
}

export function formatBillCount(count: number) {
	return `${count} ${count === 1 ? "bill" : "bills"}`;
}

function creditNoteText(credit: PayCredit) {
	const held = formatCurrency(credit.heldAmount);
	const left = credit.heldAmount - credit.appliedAmount;
	if (credit.appliedAmount <= 0.009)
		return `You hold ${held} credit. Older bills not shown here use all of it.`;
	if (left <= 0.009)
		return `You hold ${held} credit. All of it covers the bills below.`;
	return `You hold ${held} credit. ${formatCurrency(credit.appliedAmount)} of it covers the bills below, leaving ${formatCurrency(left)}.`;
}

// Explains the housemate's unallocated credit against the bills on the page.
export function CreditNote({ credit }: { credit: PayCredit }) {
	if (credit.heldAmount <= 0.009) return null;
	return (
		<p className="rounded-lg border border-success/30 bg-success/10 px-3.5 py-3 text-[13.5px] leading-6">
			{creditNoteText(credit)}
		</p>
	);
}

function CoveredBillRow({ bill }: { bill: CoveredBill }) {
	return (
		<li className="flex items-start justify-between gap-4 py-3.5 text-muted-foreground">
			<div className="min-w-0 flex-1">
				<a
					href={bill.billPath}
					className="block truncate font-semibold text-[15px] leading-tight tracking-[-0.005em] underline-offset-4 hover:underline"
				>
					{bill.billerName}
				</a>
				{bill.secondary ? (
					<p className="mt-1 text-[12.5px] leading-tight">{bill.secondary}</p>
				) : null}
			</div>
			<p className="shrink-0 pt-0.5 text-[13px] tabular-nums">
				<s>{formatCurrency(bill.amount)}</s>{" "}
				<span className="font-medium text-success">covered</span>
			</p>
		</li>
	);
}

// Bills the housemate's credit already settles, kept apart from what is
// still to pay and never flagged as overdue.
export function CoveredBillsSection({ items }: { items: CoveredBill[] }) {
	if (items.length === 0) return null;
	const total = items.reduce((sum, bill) => sum + bill.amount, 0);
	return (
		<section>
			<header className="flex items-center justify-between gap-3 pb-3">
				<h2 className={SECTION_LABEL_CLASS}>Covered by your credit</h2>
				<p className="shrink-0 font-medium text-[12px] text-muted-foreground tabular-nums">
					{formatCurrency(total)} · {formatBillCount(items.length)}
				</p>
			</header>
			<ul className="divide-y divide-border/60">
				{items.map((bill) => (
					<CoveredBillRow key={bill.billId} bill={bill} />
				))}
			</ul>
		</section>
	);
}
