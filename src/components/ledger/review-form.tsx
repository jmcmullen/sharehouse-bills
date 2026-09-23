import { Input } from "../ui/input";
import type { Payment, Ready } from "./review-payment";
import { ledgerDate } from "./statement";

interface ReviewError {
	field: string;
	message: string;
}

export function reviewValidation(input: {
	housemateId: string;
	needsNote: boolean;
	reason: string;
	manual: string[];
	candidates: Array<{ key: string; amountCents: number }>;
	amountCents: number;
	allocatedCents: number;
}): ReviewError | null {
	if (!input.housemateId)
		return {
			field: "review-housemate",
			message:
				"Choose the housemate whose account should receive this payment.",
		};
	const selected = input.candidates.filter((item) =>
		input.manual.includes(item.key),
	);
	const selectedTotal = selected.reduce(
		(sum, item) => sum - item.amountCents,
		0,
	);
	if (
		input.manual.length > 0 &&
		(selected.length !== input.manual.length ||
			selectedTotal !== input.amountCents)
	)
		return {
			field: "review-matches",
			message:
				"The selected records must equal the bank payment. Select the remaining records, or uncheck them all and add a note if this is separate money.",
		};
	if (input.allocatedCents > input.amountCents)
		return {
			field: "review-bills",
			message: "Bill allocations exceed the payment received.",
		};
	if (input.needsNote && input.reason.trim().length < 5)
		return {
			field: "review-note",
			message:
				"Add a note of at least 5 characters explaining what this payment covers or why it is separate money.",
		};
	return null;
}

export function manualReviewCandidates(
	payment: Payment,
	data: Ready,
	housemateId: string,
) {
	return data.manualPayments
		.filter(
			(item) =>
				item.housemateId === housemateId &&
				item.amountCents < 0 &&
				-item.amountCents <= payment.amountCents &&
				(!item.bankTransactionId || item.bankTransactionId === payment.id),
		)
		.sort(
			(a, b) =>
				Math.abs(a.effectiveAt - payment.effectiveAt) -
				Math.abs(b.effectiveAt - payment.effectiveAt),
		)
		.map((item) => {
			const billing = data.accounts.find(
				(account) => account.id === item.housemateId,
			)?.billing;
			const receipt = billing?.receipts.find((receipt) =>
				receipt.sourceKeys.includes(item.key),
			);
			const bills =
				receipt?.allocations
					.map((allocation) => {
						const bill = billing?.bills.find(
							(bill) => bill.id === allocation.debtId,
						);
						return bill
							? `${bill.name} · ${bill.dueAt ? ledgerDate(bill.dueAt) : "No due date"}`
							: "Removed bill";
					})
					.join(", ") ?? "";
			return { ...item, bills };
		});
}

export function reviewNeedsNote(
	payment: Payment,
	manual: string[],
	hasCandidates: boolean,
): boolean {
	if (payment.amountCents < 0 || payment.decision === "archive") return true;
	if (manual.length > 0) return false;
	return hasCandidates || payment.matchCandidate;
}

export function ReviewNote({
	required,
	invalid,
	reason,
	busy,
	onChange,
}: {
	required: boolean;
	invalid: boolean;
	reason: string;
	busy: boolean;
	onChange: (reason: string) => void;
}) {
	return (
		<label htmlFor="review-note" className="space-y-2 text-sm">
			<span>
				{required ? "Note required to credit this item" : "Note (optional)"}
			</span>
			<Input
				placeholder={
					required
						? "Explain the refund, historical payment or separate receipt"
						: "Add context if useful"
				}
				id="review-note"
				required={required}
				maxLength={1000}
				aria-invalid={invalid}
				aria-describedby={
					invalid ? "review-note-hint review-error" : "review-note-hint"
				}
				value={reason}
				disabled={busy}
				onChange={(e) => onChange(e.target.value)}
			/>
			<span
				id="review-note-hint"
				className="block text-muted-foreground text-xs"
			>
				{required
					? "Use at least 5 characters, excluding spaces at the start and end."
					: "Up to 1,000 characters."}
			</span>
		</label>
	);
}
