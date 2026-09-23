import { useState } from "react";
import { toast } from "sonner";
import type { BillPaymentView } from "../../api/services/ledger/account-payments";
import { isRentReference } from "../../api/services/ledger/model";
import {
	confirmLedgerReceipt,
	decideLedgerTransaction,
} from "../../functions/ledger";
import { Button } from "../ui/button";
import {
	type Amounts,
	BillAllocationFields,
	allocationsFrom,
	amountsFrom,
} from "./allocation-fields";
import { ManualPaymentMatches } from "./manual-payment-matches";
import {
	ReviewNote,
	manualReviewCandidates,
	reviewNeedsNote,
	reviewValidation,
} from "./review-form";
import type { Payment, Ready } from "./review-payment";
import { ledgerMoney } from "./statement";

// The "Change" path: pick the housemate, adjust the proposed bills, or match
// the transfer to money already recorded manually.
export function SinglePaymentReview({
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
	const [amounts, setAmounts] = useState<Amounts>(() =>
		amountsFrom(payment.suggestion?.allocations ?? []),
	);
	const [submitted, setSubmitted] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const billing = data.accounts.find(
		(item) => item.id === housemateId,
	)?.billing;
	const candidates = manualReviewCandidates(payment, data, housemateId);
	const allocations = allocationsFrom(amounts);
	const allocatedCents = allocations.reduce(
		(sum, item) => sum + item.amountCents,
		0,
	);
	const needsNote = reviewNeedsNote(payment, manual, candidates.length > 0);
	const validation = reviewValidation({
		housemateId,
		needsNote,
		reason,
		manual,
		candidates,
		amountCents: payment.amountCents,
		allocatedCents,
	});
	const visibleError = submitted ? validation : null;
	const allocating = eligible && payment.amountCents > 0 && manual.length === 0;

	async function save(action: Action) {
		if (busy) return;
		setSaveError(null);
		setBusy(true);
		onBusy(true);
		try {
			await sendDecision(action, {
				payment,
				housemateId,
				allocations,
				manual,
				reason,
			});
			await onSaved();
			onClose();
			toast.success(savedMessage(action, allocations.length));
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
				void save(submitAction(manual, payment.amountCents));
			}}
		>
			{eligible && (
				<HousemateSelect
					value={housemateId}
					accounts={data.accounts}
					invalid={visibleError?.field === "review-housemate"}
					busy={busy}
					onChange={(id) => {
						setHousemateId(id);
						setManual([]);
						setAmounts(
							id === payment.housemateId
								? amountsFrom(payment.suggestion?.allocations ?? [])
								: {},
						);
					}}
				/>
			)}
			{allocating && billing && (
				<BillsSection
					payment={payment}
					bills={billing.bills}
					amounts={amounts}
					allocatedCents={allocatedCents}
					invalid={visibleError?.field === "review-bills"}
					busy={busy}
					onChange={setAmounts}
				/>
			)}
			{eligible && candidates.length > 0 && (
				<details
					id="review-matches"
					tabIndex={-1}
					open={manual.length > 0 || payment.matchCandidate}
					aria-describedby={
						visibleError?.field === "review-matches"
							? "review-error"
							: undefined
					}
				>
					<summary className="cursor-pointer text-sm">
						Already recorded manually?
					</summary>
					<ManualPaymentMatches
						payments={candidates}
						selected={manual}
						onChange={setManual}
						bankAmountCents={payment.amountCents}
						busy={busy}
					/>
				</details>
			)}
			<ReviewNote
				required={eligible && needsNote}
				invalid={visibleError?.field === "review-note"}
				reason={reason}
				busy={busy}
				onChange={setReason}
			/>
			<FormFooter
				eligible={eligible}
				busy={busy}
				errors={[visibleError?.message ?? null, saveError]}
				label={reviewActionLabel(
					busy,
					manual.length > 0,
					payment.amountCents,
					allocations.length,
				)}
				onExclude={() => save("exclude")}
			/>
		</form>
	);
}

type Action = "confirm" | "credit" | "exclude" | "link";

async function sendDecision(
	action: Action,
	input: {
		payment: Payment;
		housemateId: string;
		allocations: Array<{ debtId: string; amountCents: number }>;
		manual: string[];
		reason: string;
	},
): Promise<void> {
	if (action === "confirm") {
		await confirmLedgerReceipt({
			data: {
				transactionId: input.payment.id,
				housemateId: input.housemateId,
				allocations: input.allocations,
				reason: input.reason,
				expectedRevision: input.payment.revision,
			},
		});
		return;
	}
	await decideLedgerTransaction({
		data: {
			transactionId: input.payment.id,
			action,
			housemateId: input.housemateId || undefined,
			manualSourceKeys: input.manual.length ? input.manual : undefined,
			reason: input.reason,
			expectedRevision: input.payment.revision,
		},
	});
}

function FormFooter({
	eligible,
	busy,
	errors,
	label,
	onExclude,
}: {
	eligible: boolean;
	busy: boolean;
	errors: Array<string | null>;
	label: string;
	onExclude: () => void;
}) {
	const [validation, server] = errors;
	return (
		<>
			{!eligible && (
				<p className="text-muted-foreground text-sm">
					This bank activity cannot be credited as a housemate payment.
				</p>
			)}
			{validation && (
				<p id="review-error" role="alert" className="text-destructive text-sm">
					{validation}
				</p>
			)}
			{server && (
				<p role="alert" className="text-destructive text-sm">
					{server}
				</p>
			)}
			<div className="flex flex-wrap gap-2">
				{eligible && (
					<Button type="submit" disabled={busy}>
						{label}
					</Button>
				)}
				<Button
					type="button"
					variant="outline"
					disabled={busy}
					onClick={onExclude}
				>
					Not a household payment
				</Button>
			</div>
		</>
	);
}

function submitAction(
	manual: string[],
	amountCents: number,
): "link" | "credit" | "confirm" {
	if (manual.length) return "link";
	return amountCents < 0 ? "credit" : "confirm";
}

function HousemateSelect({
	value,
	accounts,
	invalid,
	busy,
	onChange,
}: {
	value: string;
	accounts: Array<{ id: string; name: string }>;
	invalid: boolean;
	busy: boolean;
	onChange: (id: string) => void;
}) {
	return (
		<label htmlFor="review-housemate" className="space-y-2 text-sm">
			<span>Housemate</span>
			<select
				className="h-10 w-full rounded-md border bg-background px-3"
				id="review-housemate"
				required
				aria-invalid={invalid}
				aria-describedby={invalid ? "review-error" : undefined}
				value={value}
				disabled={busy}
				onChange={(e) => onChange(e.target.value)}
			>
				<option value="">Choose housemate</option>
				{accounts.map((item) => (
					<option key={item.id} value={item.id}>
						{item.name}
					</option>
				))}
			</select>
		</label>
	);
}

function BillsSection({
	payment,
	bills,
	amounts,
	allocatedCents,
	invalid,
	busy,
	onChange,
}: {
	payment: Payment;
	bills: BillPaymentView[];
	amounts: Amounts;
	allocatedCents: number;
	invalid: boolean;
	busy: boolean;
	onChange: (amounts: Amounts) => void;
}) {
	return (
		<fieldset
			id="review-bills"
			tabIndex={-1}
			className="space-y-3"
			aria-describedby={invalid ? "review-error" : undefined}
		>
			<legend className="font-medium text-sm">Bills this payment covers</legend>
			{payment.suggestion && (
				<p className="text-muted-foreground text-sm">
					Suggested: {payment.suggestion.reason}
				</p>
			)}
			<BillAllocationFields
				bills={bills}
				rentOnly={isRentReference(`${payment.description} ${payment.message}`)}
				kept={[]}
				amounts={amounts}
				busy={busy}
				onChange={onChange}
			/>
			<p className={invalid ? "text-destructive text-sm" : "text-sm"}>
				Kept as credit: {ledgerMoney(payment.amountCents - allocatedCents)}
			</p>
		</fieldset>
	);
}

function reviewActionLabel(
	busy: boolean,
	linked: boolean,
	amountCents: number,
	allocated: number,
): string {
	if (busy) return "Saving…";
	if (linked) return "Confirm match · no extra credit";
	if (amountCents < 0) return "Confirm household refund";
	return allocated ? "Confirm payment" : "Keep as credit";
}

function savedMessage(action: Action, allocated: number): string {
	if (action === "exclude") return "Marked as not a household payment";
	if (action === "confirm")
		return allocated
			? "Payment confirmed and bills updated"
			: "Payment kept as credit";
	return "Payment decision saved";
}
