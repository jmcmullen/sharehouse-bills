import { useState } from "react";
import { toast } from "sonner";
import { reviewHint } from "../../api/services/ledger/review-policy";
import {
	decideLedgerTransaction,
	type getPaymentReview,
} from "../../functions/ledger";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { ManualPaymentMatches } from "./manual-payment-matches";
import { SplitPayment } from "./split-payment";
import { ledgerDate, ledgerMoney, ledgerTime } from "./statement";

type Ready = Extract<
	Awaited<ReturnType<typeof getPaymentReview>>,
	{ available: true }
>;
export type Payment = Ready["reviews"][number];

export function ReviewPayment({
	payment,
	data,
	onClose,
	onSaved,
}: {
	payment: Payment;
	data: Ready;
	onClose: () => void;
	onSaved: () => Promise<void>;
}) {
	const [busy, setBusy] = useState(false);
	const [split, setSplit] = useState(payment.allocations.length > 1);
	const eligible =
		payment.bankStatus === "SETTLED" &&
		payment.currency === "AUD" &&
		!payment.internalTransfer &&
		!["Interest", "Refund"].includes(payment.transactionType);
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !busy) onClose();
			}}
		>
			<DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>
						{payment.amountCents < 0 ? "Money sent" : "Payment received"} ·{" "}
						{ledgerMoney(Math.abs(payment.amountCents))}
					</DialogTitle>
					<DialogDescription>
						{ledgerTime(payment.effectiveAt)}
					</DialogDescription>
				</DialogHeader>
				<div className="rounded-lg border p-4 text-sm">
					<p className="font-medium">{payment.description}</p>
					<p className="mt-2">
						Reference:{" "}
						<strong>{payment.message || "No reference supplied"}</strong>
					</p>
					<p className="mt-3 text-muted-foreground">
						{payment.decision === "review" || payment.matchCandidate
							? reviewHint(payment)
							: payment.reason}
					</p>
				</div>
				{payment.matchCandidate && payment.decision === "credit" && (
					<p className="rounded-lg border border-amber-500/40 p-3 text-sm">
						This bank transfer already counts in the balance. Confirm a match
						only if it is the same money as your manual records. The match will
						remove the duplicate credit.
					</p>
				)}
				{eligible && payment.amountCents > 0 && (
					<div className="flex gap-2">
						<Button
							variant={!split ? "secondary" : "ghost"}
							aria-pressed={!split}
							onClick={() => setSplit(false)}
							disabled={busy}
						>
							One housemate
						</Button>
						<Button
							variant={split ? "secondary" : "ghost"}
							aria-pressed={split}
							onClick={() => setSplit(true)}
							disabled={busy}
						>
							Split payment
						</Button>
					</div>
				)}
				{split && eligible ? (
					<SplitPayment
						payment={payment}
						accounts={data.accounts}
						onSaved={async () => {
							await onSaved();
							onClose();
						}}
						onBusy={setBusy}
					/>
				) : (
					<SinglePaymentReview
						payment={payment}
						data={data}
						eligible={eligible}
						onClose={onClose}
						onSaved={onSaved}
						onBusy={setBusy}
					/>
				)}
				<Button variant="ghost" disabled={busy} onClick={onClose}>
					Close
				</Button>
				<details className="break-all text-muted-foreground text-xs">
					<summary>Bank details and decision</summary>
					<p>{payment.reason}</p>
					<p>{payment.id}</p>
				</details>
			</DialogContent>
		</Dialog>
	);
}

function SinglePaymentReview({
	payment,
	data,
	eligible,
	onClose,
	onSaved,
	onBusy,
}: {
	payment: Payment;
	data: Ready;
	eligible: boolean;
	onClose: () => void;
	onSaved: () => Promise<void>;
	onBusy: (busy: boolean) => void;
}) {
	const [housemateId, setHousemateId] = useState(payment.housemateId ?? "");
	const [reason, setReason] = useState("");
	const [manual, setManual] = useState<string[]>(payment.manualSourceKeys);
	const [submitted, setSubmitted] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const candidates = manualReviewCandidates(payment, data, housemateId);
	const needsNote = reviewNeedsNote(payment, manual, candidates.length > 0);
	const validation = reviewValidation({
		housemateId,
		needsNote,
		reason,
		manual,
		candidates,
		amountCents: payment.amountCents,
	});
	const visibleError = submitted ? validation : null;
	async function decide(action: "credit" | "exclude" | "link") {
		if (busy) return;
		setSaveError(null);
		setBusy(true);
		onBusy(true);
		try {
			await decideLedgerTransaction({
				data: {
					transactionId: payment.id,
					action,
					housemateId: housemateId || undefined,
					manualSourceKeys: manual.length ? manual : undefined,
					reason,
					expectedRevision: payment.revision,
				},
			});
			await onSaved();
			onClose();
			toast.success(
				action === "exclude"
					? "Marked as not a household payment"
					: "Payment decision saved",
			);
		} catch (error) {
			setSaveError(
				error instanceof Error ? error.message : "Could not save the decision",
			);
		} finally {
			setBusy(false);
			onBusy(false);
		}
	}

	return (
		<form
			className="grid gap-4"
			noValidate
			onSubmit={(event) => {
				event.preventDefault();
				if (busy || !eligible) return;
				setSubmitted(true);
				setSaveError(null);
				if (validation) {
					event.currentTarget
						.querySelector<HTMLElement>(`#${validation.field}`)
						?.focus();
					return;
				}
				void decide(manual.length ? "link" : "credit");
			}}
		>
			{eligible && (
				<label htmlFor="review-housemate" className="space-y-2 text-sm">
					<span>Housemate</span>
					<select
						className="h-10 w-full rounded-md border bg-background px-3"
						id="review-housemate"
						required
						aria-invalid={visibleError?.field === "review-housemate"}
						aria-describedby={
							visibleError?.field === "review-housemate"
								? "review-error"
								: undefined
						}
						value={housemateId}
						disabled={busy}
						onChange={(e) => {
							setHousemateId(e.target.value);
							setManual([]);
						}}
					>
						<option value="">Choose housemate</option>
						{data.accounts.map((item) => (
							<option key={item.id} value={item.id}>
								{item.name}
							</option>
						))}
					</select>
				</label>
			)}
			{eligible && candidates.length > 0 && (
				<div
					id="review-matches"
					tabIndex={-1}
					aria-describedby={
						visibleError?.field === "review-matches"
							? "review-error"
							: undefined
					}
				>
					<ManualPaymentMatches
						payments={candidates}
						selected={manual}
						onChange={setManual}
						bankAmountCents={payment.amountCents}
						busy={busy}
					/>
				</div>
			)}
			<ReviewNote
				required={eligible && needsNote}
				invalid={visibleError?.field === "review-note"}
				reason={reason}
				busy={busy}
				onChange={setReason}
			/>
			{!eligible && (
				<p className="text-muted-foreground text-sm">
					This bank activity cannot be credited as a housemate payment.
				</p>
			)}
			{visibleError && (
				<p id="review-error" role="alert" className="text-destructive text-sm">
					{visibleError.message}
				</p>
			)}
			{saveError && (
				<p role="alert" className="text-destructive text-sm">
					{saveError}
				</p>
			)}
			<div className="flex flex-wrap gap-2">
				{eligible && (
					<Button type="submit" disabled={busy}>
						{reviewActionLabel(busy, manual.length > 0, payment.amountCents)}
					</Button>
				)}
				<Button
					type="button"
					variant="outline"
					disabled={busy}
					onClick={() => decide("exclude")}
				>
					Not a household payment
				</Button>
			</div>
		</form>
	);
}

function reviewActionLabel(
	busy: boolean,
	linked: boolean,
	amountCents: number,
): string {
	if (busy) return "Saving…";
	if (linked) return "Confirm match · no extra credit";
	if (amountCents < 0) return "Confirm household refund";
	return "Credit account";
}

function reviewValidation(input: {
	housemateId: string;
	needsNote: boolean;
	reason: string;
	manual: string[];
	candidates: Array<{ key: string; amountCents: number }>;
	amountCents: number;
}): { field: string; message: string } | null {
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
	if (input.needsNote && input.reason.trim().length < 5)
		return {
			field: "review-note",
			message:
				"Add a note of at least 5 characters explaining what this payment covers or why it is separate money.",
		};
	return null;
}

function manualReviewCandidates(
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

function ReviewNote({
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

function reviewNeedsNote(
	payment: Payment,
	manual: string[],
	hasCandidates: boolean,
): boolean {
	if (payment.amountCents < 0 || payment.decision === "archive") return true;
	if (manual.length > 0) return false;
	return hasCandidates || payment.group === "duplicate";
}
