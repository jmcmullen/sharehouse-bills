import { reviewHint } from "../../api/services/ledger/review-policy";
import { Button } from "../ui/button";
import { type Payment, paymentEligible } from "./review-payment";
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
	onConfirm,
	onExclude,
}: {
	payment: Payment;
	name: string | undefined;
	busy: boolean;
	selectable: boolean;
	checked: boolean;
	selectionFull: boolean;
	onCheck: (checked: boolean) => void;
	onOpen: () => void;
	onConfirm: (
		allocations: Array<{ debtId: string; amountCents: number }>,
	) => void;
	onExclude: () => void;
}) {
	const needsReview = payment.decision === "review";
	const reconcilable =
		needsReview &&
		payment.housemateId !== null &&
		payment.amountCents > 0 &&
		!payment.shared &&
		paymentEligible(payment);
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
						{payment.origin === "review" ? "Reviewed" : ""}
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
			<div className="col-start-2 flex flex-wrap items-center justify-between gap-2 sm:justify-end">
				<span className="font-semibold tabular-nums">
					{ledgerMoney(payment.amountCents)}
				</span>
				{reconcilable ? (
					<RowActions
						payment={payment}
						busy={busy}
						onOpen={onOpen}
						onConfirm={onConfirm}
						onExclude={onExclude}
					/>
				) : (
					<Button variant="outline" disabled={busy} onClick={onOpen}>
						{needsReview ? "Review" : "View decision"}
					</Button>
				)}
			</div>
		</article>
	);
}

// Confirm and keep-as-credit are one tap only when nothing suggests the money
// is already recorded; a possible duplicate goes through the dialog.
function RowActions({
	payment,
	busy,
	onOpen,
	onConfirm,
	onExclude,
}: {
	payment: Payment;
	busy: boolean;
	onOpen: () => void;
	onConfirm: (
		allocations: Array<{ debtId: string; amountCents: number }>,
	) => void;
	onExclude: () => void;
}) {
	const quick = !payment.matchCandidate;
	return (
		<div className="flex flex-wrap gap-2">
			{quick && payment.suggestion && (
				<Button
					disabled={busy}
					onClick={() => onConfirm(payment.suggestion?.allocations ?? [])}
				>
					Confirm
				</Button>
			)}
			<Button variant="outline" disabled={busy} onClick={onOpen}>
				Change
			</Button>
			{quick && (
				<Button variant="ghost" disabled={busy} onClick={() => onConfirm([])}>
					Keep as credit
				</Button>
			)}
			<Button variant="ghost" disabled={busy} onClick={onExclude}>
				Not a bill
			</Button>
		</div>
	);
}

function sharedLabel(payment: Payment): string {
	return payment.allocations.length > 1 || payment.shared
		? "Shared payment"
		: "Choose housemate";
}
