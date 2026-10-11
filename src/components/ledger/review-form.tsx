import { Input } from "../ui/input";
import type { Payment } from "./review-payment";

interface ReviewError {
	field: string;
	message: string;
}

export function reviewValidation(input: {
	housemateId: string;
	needsNote: boolean;
	reason: string;
	amountCents: number;
	allocatedCents: number;
}): ReviewError | null {
	if (!input.housemateId)
		return {
			field: "review-housemate",
			message:
				"Choose the housemate whose account should receive this payment.",
		};
	if (input.amountCents > 0 && input.allocatedCents > input.amountCents)
		return {
			field: "review-bills",
			message: "Bill allocations exceed the payment received.",
		};
	if (input.needsNote && input.reason.trim().length < 5)
		return {
			field: "review-note",
			message:
				"Add a note of at least 5 characters explaining what this payment covers.",
		};
	return null;
}

// Refunds and payments from before the bill history need the admin's words.
export function reviewNeedsNote(payment: Payment): boolean {
	return payment.amountCents < 0 || payment.decision === "archived";
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
						? "Explain the refund or historical payment"
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
