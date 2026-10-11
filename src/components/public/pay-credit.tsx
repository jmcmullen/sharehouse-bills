import { formatCents } from "@/lib/money";
import { RowContent } from "./row-content";
import { SectionHeader } from "./section-header";

interface CoveredBill {
	billId: string;
	billerName: string;
	billPath: string;
	amountCents: number;
	secondary: string | null;
}

interface PayCredit {
	heldCents: number;
	appliedCents: number;
}

export function formatBillCount(count: number) {
	return `${count} ${count === 1 ? "bill" : "bills"}`;
}

function creditNoteText(credit: PayCredit) {
	const held = formatCents(credit.heldCents);
	const left = credit.heldCents - credit.appliedCents;
	if (credit.appliedCents <= 0)
		return `You hold ${held} credit. Older bills not shown here use all of it.`;
	if (left <= 0)
		return `You hold ${held} credit. All of it covers the bills below.`;
	return `You hold ${held} credit. ${formatCents(credit.appliedCents)} of it covers the bills below, leaving ${formatCents(left)}.`;
}

// Explains the housemate's unallocated credit against the bills on the page.
export function CreditNote({ credit }: { credit: PayCredit }) {
	if (credit.heldCents <= 0) return null;
	return (
		<p className="rounded-lg border border-success/30 bg-success/10 px-3.5 py-3 text-[13.5px] leading-6">
			{creditNoteText(credit)}
		</p>
	);
}

function CoveredBillRow({ bill }: { bill: CoveredBill }) {
	return (
		<li className="py-3.5 text-muted-foreground">
			<RowContent
				primary={
					<a
						href={bill.billPath}
						className="block truncate underline-offset-4 hover:underline"
					>
						{bill.billerName}
					</a>
				}
				secondary={bill.secondary}
				aside={
					<p className="text-[13px] tabular-nums">
						<s>{formatCents(bill.amountCents)}</s>{" "}
						<span className="font-medium text-success">covered</span>
					</p>
				}
			/>
		</li>
	);
}

// Bills the housemate's credit already settles, kept apart from what is
// still to pay and never flagged as overdue.
export function CoveredBillsSection({ items }: { items: CoveredBill[] }) {
	if (items.length === 0) return null;
	const total = items.reduce((sum, bill) => sum + bill.amountCents, 0);
	return (
		<section>
			<SectionHeader
				label="Covered by your credit"
				aside={`${formatCents(total)} · ${formatBillCount(items.length)}`}
			/>
			<ul className="divide-y divide-border/60">
				{items.map((bill) => (
					<CoveredBillRow key={bill.billId} bill={bill} />
				))}
			</ul>
		</section>
	);
}
