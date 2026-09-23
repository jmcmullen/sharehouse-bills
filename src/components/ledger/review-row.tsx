import { reviewHint } from "../../api/services/ledger/review-policy";
import { Button } from "../ui/button";
import type { Payment } from "./review-payment";
import { ledgerMoney, ledgerTime } from "./statement";

export function ReviewRow({
	payment,
	name,
	busy,
	selectable,
	checked,
	selectionFull,
	onCheck,
	onOpen,
}: {
	payment: Payment;
	name: string | undefined;
	busy: boolean;
	selectable: boolean;
	checked: boolean;
	selectionFull: boolean;
	onCheck: (checked: boolean) => void;
	onOpen: () => void;
}) {
	const needsReview = payment.decision === "review" || payment.matchCandidate;
	return (
		<article className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
			{selectable && (
				<input
					type="checkbox"
					className="size-5 shrink-0"
					aria-label={`Select ${payment.message || payment.description} ${ledgerMoney(payment.amountCents)}`}
					checked={checked}
					disabled={busy || (!checked && selectionFull)}
					onChange={(event) => onCheck(event.target.checked)}
				/>
			)}
			<div className="col-start-2 min-w-0 flex-1">
				<p className="font-medium">
					{name ?? sharedLabel(payment)}{" "}
					<span className="ml-2 font-normal text-muted-foreground text-sm">
						{originLabel(payment)}
					</span>
				</p>
				<p className="mt-1 break-words text-sm">
					{payment.message || "No reference"} · {payment.description}
				</p>
				<p className="mt-1 text-muted-foreground text-xs">
					{ledgerTime(payment.effectiveAt)}
				</p>
				{needsReview && (
					<p className="mt-2 text-amber-700 text-sm dark:text-amber-300">
						{reviewHint(payment)}
					</p>
				)}
			</div>
			<div className="col-start-2 flex items-center justify-between gap-4 sm:justify-start">
				<span className="font-semibold tabular-nums">
					{ledgerMoney(payment.amountCents)}
				</span>
				<Button variant="outline" disabled={busy} onClick={onOpen}>
					{needsReview ? "Review" : "View decision"}
				</Button>
			</div>
		</article>
	);
}

function sharedLabel(payment: Payment): string {
	return payment.allocations.length > 1 || payment.shared
		? "Shared payment"
		: "Choose housemate";
}

function originLabel(payment: Payment): string {
	if (payment.origin === "review") return "Reviewed";
	return payment.decision === "credit" ? "Automatic" : "";
}
