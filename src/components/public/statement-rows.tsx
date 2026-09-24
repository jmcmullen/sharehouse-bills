import type {
	BillStatus,
	StatementBill,
	StatementMonth,
	StatementPayment,
} from "@/api/services/statement-timeline";
import { formatCurrency } from "@/lib/share-preview";
import type { ReactNode } from "react";
import { RowContent } from "./row-content";
import { SectionHeader } from "./section-header";
import { PublicStatusBadge } from "./status-badge";

const STATUS: Record<
	BillStatus,
	{ label: string; tone: "danger" | "info" | "neutral" | "success" | "warning" }
> = {
	paid: { label: "Paid", tone: "success" },
	part: { label: "Part paid", tone: "warning" },
	covered: { label: "Covered by credit", tone: "info" },
	overdue: { label: "Overdue", tone: "danger" },
	due: { label: "Due", tone: "neutral" },
};

function money(cents: number) {
	return formatCurrency(cents / 100);
}

function day(seconds: number) {
	return new Intl.DateTimeFormat("en-AU", {
		weekday: "short",
		day: "numeric",
		month: "short",
		timeZone: "Australia/Sydney",
	}).format(new Date(seconds * 1000));
}

function billDetail(bill: StatementBill) {
	const due = `Due ${day(bill.at)}`;
	return bill.leftCents > 0 && bill.leftCents < bill.amountCents
		? `${due} · ${money(bill.leftCents)} left`
		: due;
}

function Amount({ cents, paid }: { cents: number; paid?: boolean }) {
	return (
		<p
			className={`font-semibold text-[15px] tabular-nums leading-tight ${paid ? "text-success" : ""}`}
		>
			{money(cents)}
		</p>
	);
}

interface Line {
	key: string;
	label: string;
	cents: number | null;
}

function Linked({ lines }: { lines: Line[] }) {
	return (
		<ul className="mb-3.5 space-y-1.5 rounded-lg bg-muted/50 px-3.5 py-3 text-[12.5px] text-muted-foreground">
			{lines.map((line) => (
				<li key={line.key} className="flex items-start justify-between gap-3">
					<span className="min-w-0">{line.label}</span>
					{line.cents === null ? null : (
						<span className="shrink-0 tabular-nums">{money(line.cents)}</span>
					)}
				</li>
			))}
		</ul>
	);
}

function billLines(bill: StatementBill): Line[] {
	const lines = [
		...bill.payments.map((payment, index) => ({
			key: `payment-${index}`,
			label: `${payment.label} ${day(payment.at)}`,
			cents: payment.amountCents,
		})),
		...(bill.creditCents > 0
			? [
					{
						key: "credit",
						label: "Covered by your credit",
						cents: bill.creditCents,
					},
				]
			: []),
		...(bill.leftCents > 0
			? [{ key: "left", label: "Still to pay", cents: bill.leftCents }]
			: []),
	];
	return lines.length
		? lines
		: [{ key: "none", label: "No payments yet", cents: null }];
}

function paymentLines(payment: StatementPayment): Line[] {
	const bills = payment.bills.map((bill, index) => ({
		key: `bill-${index}`,
		label: bill.at === null ? bill.name : `${bill.name} · due ${day(bill.at)}`,
		cents: bill.amountCents,
	}));
	return payment.heldCents > 0
		? [
				...bills,
				{ key: "held", label: "Held as credit", cents: payment.heldCents },
			]
		: bills;
}

function ExpandableRow({
	summary,
	children,
}: {
	summary: ReactNode;
	children: ReactNode;
}) {
	return (
		<li>
			<details>
				<summary className="cursor-pointer list-none py-3.5 [&::-webkit-details-marker]:hidden">
					{summary}
				</summary>
				{children}
			</details>
		</li>
	);
}

function BillItem({ bill }: { bill: StatementBill }) {
	const status = STATUS[bill.status];
	return (
		<ExpandableRow
			summary={
				<RowContent
					primary={bill.name}
					secondary={billDetail(bill)}
					aside={
						<>
							<Amount cents={bill.amountCents} />
							<PublicStatusBadge tone={status.tone}>
								{status.label}
							</PublicStatusBadge>
						</>
					}
				/>
			}
		>
			<Linked lines={billLines(bill)} />
		</ExpandableRow>
	);
}

function PaymentItem({ payment }: { payment: StatementPayment }) {
	return (
		<ExpandableRow
			summary={
				<RowContent
					primary={payment.label}
					secondary={`${day(payment.at)} · ${payment.note}`}
					aside={<Amount cents={payment.amountCents} paid />}
				/>
			}
		>
			<Linked lines={paymentLines(payment)} />
		</ExpandableRow>
	);
}

// One month of the statement: bill shares and payments, newest first.
export function StatementMonthSection({ month }: { month: StatementMonth }) {
	return (
		<section>
			<SectionHeader label={month.label} />
			<ul className="divide-y divide-border/60">
				{month.items.map((item) =>
					item.kind === "bill" ? (
						<BillItem key={item.id} bill={item} />
					) : (
						<PaymentItem key={item.id} payment={item} />
					),
				)}
			</ul>
		</section>
	);
}
