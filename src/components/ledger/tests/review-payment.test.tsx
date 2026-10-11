/// <reference types="bun" />
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import "../../../lib/tests/dom";
import { createElement } from "react";
import type { AccountPayments } from "../../../api/services/payments/account-payments";
import type { decideLedgerTransaction } from "../../../functions/ledger";
import type {
	Payment,
	ReviewPayment as ReviewPaymentComponent,
} from "../review-payment";

type Ready = Parameters<typeof ReviewPaymentComponent>[0]["data"];
type Decision = Parameters<typeof decideLedgerTransaction>[0];

const decide = mock(async (_input: Decision): Promise<void> => {});
mock.module("../../../functions/ledger", () => ({
	decideLedgerTransaction: decide,
}));
const { cleanup, fireEvent, render, screen, waitFor } = await import(
	"@testing-library/react"
);
const { ReviewPayment } = await import("../review-payment");

const payment: Payment = {
	id: "bank-1",
	housemateId: "oliver",
	amountCents: 10000,
	effectiveAt: 1788825600,
	bankStatus: "SETTLED",
	currency: "AUD",
	internalTransfer: false,
	transactionType: "Payment",
	description: "Oliver",
	message: "",
	reason: "Identified housemate; confirm the bills this payment covers",
	decision: "review",
	decided: false,
	group: "unclear",
	suggestion: null,
	shared: false,
	allocations: [],
	revision: 7,
};
const bill = (id: string, name: string, amountCents: number) => ({
	id,
	billId: `bill-${id}`,
	housemateId: "oliver",
	isOwner: false,
	name,
	billType: null,
	category: name.toLowerCase(),
	stackGroup: null,
	recurringTemplateName: null,
	dueAt: payment.effectiveAt,
	billPeriodStart: null,
	billPeriodEnd: null,
	amountCents,
	paidCents: 0,
	remainingCents: amountCents,
	settledAt: null,
	overdue: false,
	coveredCents: 0,
	leftCents: amountCents,
	payments: [],
});
const billing: AccountPayments = {
	revision: "r1",
	bills: [bill("gas", "Gas", 6000), bill("clean", "Cleaners", 3000)],
	receipts: [],
	unallocatedCents: 0,
	unpaidCents: 9000,
};
// ReviewPayment reads only accounts from the loader data.
const data = {
	accounts: [{ id: "oliver", name: "Oliver", billing }],
} as unknown as Ready;
const suggested: Partial<Payment> = {
	group: "suggested",
	suggestion: {
		allocations: [{ debtId: "gas", amountCents: 6000 }],
		confidence: "exact",
		reason: "Exactly matches Gas",
	},
};

function deferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve = (): void => {};
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

// The data of the nth decision sent, as a confirmation.
function confirmed(index: number) {
	const data = decide.mock.calls[index][0].data;
	if (data.action !== "confirm") throw new Error("Expected a confirmation");
	return data;
}

const note = (): HTMLInputElement =>
	screen.getByRole("textbox", { name: /Note/ }) as HTMLInputElement;
const button = (name: string): HTMLButtonElement =>
	screen.getByRole("button", { name }) as HTMLButtonElement;
const field = (name: RegExp): HTMLInputElement =>
	screen.getByRole("spinbutton", { name }) as HTMLInputElement;

function openReview(overrides: Partial<Payment> = {}) {
	const onSaved = mock(async () => {});
	const onClose = mock(() => {});
	render(
		createElement(ReviewPayment, {
			payment: { ...payment, ...overrides },
			data,
			onSaved,
			onClose,
		}),
	);
	return { onSaved, onClose };
}

beforeEach(() => {
	decide.mockReset();
	decide.mockImplementation(async () => {});
});
afterEach(cleanup);

test("short notes explain the requirement; a corrected note keeps the money as credit", async () => {
	const { onSaved, onClose } = openReview({ decision: "archived" });
	const keep = button("Keep as credit");
	fireEvent.change(note(), { target: { value: " rent " } });
	expect(keep.disabled).toBe(false);
	fireEvent.click(keep);
	expect(decide).not.toHaveBeenCalled();
	expect(screen.getByRole("alert").textContent).toContain(
		"at least 5 characters",
	);
	expect(document.activeElement).toBe(note());
	expect(note().getAttribute("aria-invalid")).toBe("true");
	fireEvent.change(note(), { target: { value: "Separate rent payment" } });
	expect(screen.queryByRole("alert")).toBeNull();
	fireEvent.click(keep);
	await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
	expect(onSaved).toHaveBeenCalledTimes(1);
	expect(decide).toHaveBeenCalledWith({
		data: {
			transactionId: "bank-1",
			action: "confirm",
			housemateId: "oliver",
			allocations: [],
			reason: "Separate rent payment",
			expectedRevision: 7,
		},
	});
});

test("a suggestion pre-fills the bills; edited amounts are what gets confirmed", async () => {
	openReview(suggested);
	expect(field(/Allocate to Gas/).value).toBe("60.00");
	expect(field(/Allocate to Cleaners/).value).toBe("");
	expect(screen.getByText(/Kept as credit: \$40\.00/)).toBeTruthy();
	fireEvent.change(field(/Allocate to Cleaners/), { target: { value: "30" } });
	expect(screen.getByText(/Kept as credit: \$10\.00/)).toBeTruthy();
	fireEvent.change(note(), { target: { value: "Gas and cleaning" } });
	fireEvent.click(button("Confirm payment"));
	await waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
	expect(confirmed(0).allocations).toEqual([
		{ debtId: "gas", amountCents: 6000 },
		{ debtId: "clean", amountCents: 3000 },
	]);
	expect(confirmed(0).reason).toBe("Gas and cleaning");
});

test("allocating more than the payment is refused before it reaches the server", () => {
	openReview(suggested);
	fireEvent.change(field(/Allocate to Gas/), { target: { value: "150" } });
	fireEvent.click(button("Confirm payment"));
	expect(decide).not.toHaveBeenCalled();
	expect(screen.getByRole("alert").textContent).toContain("exceed");
});

test("a note alone cannot confirm an unassigned payment; the form focuses the housemate", async () => {
	openReview({ housemateId: null });
	fireEvent.change(note(), {
		target: { value: "Separate payment for bills" },
	});
	fireEvent.click(button("Keep as credit"));
	expect(decide).not.toHaveBeenCalled();
	expect(screen.getByRole("alert").textContent).toContain(
		"Choose the housemate",
	);
	expect(document.activeElement).toBe(screen.getByRole("combobox"));
	fireEvent.change(screen.getByRole("combobox"), {
		target: { value: "oliver" },
	});
	fireEvent.click(button("Keep as credit"));
	await waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
	expect(confirmed(0).housemateId).toBe("oliver");
});

test("money sent back is recorded as a refund with a note", async () => {
	openReview({ amountCents: -5000 });
	fireEvent.click(button("Confirm household refund"));
	expect(decide).not.toHaveBeenCalled();
	fireEvent.change(note(), { target: { value: "Bond returned" } });
	fireEvent.click(button("Confirm household refund"));
	await waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
	expect(decide.mock.calls[0][0].data).toEqual({
		transactionId: "bank-1",
		action: "refund",
		housemateId: "oliver",
		reason: "Bond returned",
		expectedRevision: 7,
	});
});

test("excluding a personal payment needs neither a housemate nor a note", async () => {
	openReview({ housemateId: null });
	fireEvent.click(button("Not a household payment"));
	await waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
	expect(decide.mock.calls[0][0].data.action).toBe("exclude");
});

test("server errors stay visible and permit retry", async () => {
	const { onClose } = openReview();
	decide.mockRejectedValueOnce(
		new Error("Payment changed. Refresh and try again."),
	);
	fireEvent.change(note(), { target: { value: "Separate money" } });
	fireEvent.click(button("Keep as credit"));
	await waitFor(() =>
		expect(screen.getByRole("alert").textContent).toContain("Payment changed"),
	);
	expect(onClose).not.toHaveBeenCalled();
	expect(button("Keep as credit").disabled).toBe(false);
	fireEvent.click(button("Keep as credit"));
	await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
});

test("saving disables repeat submissions until the request completes", async () => {
	const { onClose } = openReview();
	const pending = deferred();
	decide.mockImplementationOnce(() => pending.promise);
	fireEvent.change(note(), { target: { value: "Separate money" } });
	fireEvent.click(button("Keep as credit"));
	const saving = button("Saving…");
	expect(saving.disabled).toBe(true);
	fireEvent.click(saving);
	const form = saving.closest("form");
	if (!form) throw new Error("Review form not rendered");
	fireEvent.submit(form);
	expect(decide).toHaveBeenCalledTimes(1);
	pending.resolve();
	await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
});
