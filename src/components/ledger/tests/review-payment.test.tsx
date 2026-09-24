/// <reference types="bun" />
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import "../../../lib/tests/dom";
import { createElement } from "react";
import type { AccountPayments } from "../../../api/services/ledger/account-payments";
import type {
	confirmLedgerReceipt,
	decideLedgerTransaction,
} from "../../../functions/ledger";
import type {
	Payment,
	ReviewPayment as ReviewPaymentComponent,
} from "../review-payment";

type Ready = Parameters<typeof ReviewPaymentComponent>[0]["data"];
type Decision = Parameters<typeof decideLedgerTransaction>[0];
type Confirmation = Parameters<typeof confirmLedgerReceipt>[0];

const decide = mock(async (_input: Decision): Promise<void> => {});
const confirm = mock(async (_input: Confirmation): Promise<void> => {});
mock.module("../../../functions/ledger", () => ({
	decideLedgerTransaction: decide,
	confirmLedgerReceipt: confirm,
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
	reason: "Possible existing manual payment: compare receipts",
	decision: "review",
	origin: "automatic",
	group: "unclear",
	suggestion: null,
	shared: false,
	matchCandidate: true,
	allocations: [],
	manualSourceKeys: [],
	revision: 7,
};
const manualPayments: Ready["manualPayments"] = [
	{
		key: "manual:1",
		housemateId: "oliver",
		amountCents: -6000,
		effectiveAt: payment.effectiveAt,
		description: "Electricity",
		bankTransactionId: null,
	},
	{
		key: "manual:2",
		housemateId: "oliver",
		amountCents: -4000,
		effectiveAt: payment.effectiveAt,
		description: "Internet",
		bankTransactionId: null,
	},
];
const bill = (id: string, name: string, amountCents: number) => ({
	id,
	name,
	category: name.toLowerCase(),
	dueAt: payment.effectiveAt,
	amountCents,
	paidCents: 0,
	remainingCents: amountCents,
	payments: [],
});
const billing: AccountPayments = {
	revision: "r1",
	bills: [bill("gas", "Gas", 6000), bill("clean", "Cleaners", 3000)],
	receipts: [],
	unallocatedCents: 0,
	unpaidCents: 9000,
};
// ReviewPayment reads only accounts and manualPayments from the loader data.
const data = {
	accounts: [{ id: "oliver", name: "Oliver", billing }],
	manualPayments,
} as unknown as Ready;
const suggested: Partial<Payment> = {
	matchCandidate: false,
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
	confirm.mockReset();
	confirm.mockImplementation(async () => {});
});
afterEach(cleanup);

test("short notes explain the requirement; a corrected note keeps the money as credit", async () => {
	const { onSaved, onClose } = openReview();
	const keep = button("Keep as credit");
	fireEvent.change(note(), { target: { value: " rent " } });
	expect(keep.disabled).toBe(false);
	fireEvent.click(keep);
	expect(confirm).not.toHaveBeenCalled();
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
	expect(decide).not.toHaveBeenCalled();
	expect(confirm).toHaveBeenCalledWith({
		data: {
			transactionId: "bank-1",
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
	await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
	expect(confirm.mock.calls[0][0].data.allocations).toEqual([
		{ debtId: "gas", amountCents: 6000 },
		{ debtId: "clean", amountCents: 3000 },
	]);
	expect(confirm.mock.calls[0][0].data.reason).toBe("Gas and cleaning");
});

test("allocating more than the payment is refused before it reaches the server", () => {
	openReview(suggested);
	fireEvent.change(field(/Allocate to Gas/), { target: { value: "150" } });
	fireEvent.click(button("Confirm payment"));
	expect(confirm).not.toHaveBeenCalled();
	expect(screen.getByRole("alert").textContent).toContain("exceed");
});

test("a note alone cannot confirm an unassigned payment; the form focuses the housemate", async () => {
	openReview({ housemateId: null });
	fireEvent.change(note(), {
		target: { value: "Separate payment for bills" },
	});
	fireEvent.click(button("Keep as credit"));
	expect(confirm).not.toHaveBeenCalled();
	expect(screen.getByRole("alert").textContent).toContain(
		"Choose the housemate",
	);
	expect(document.activeElement).toBe(screen.getByRole("combobox"));
	fireEvent.change(screen.getByRole("combobox"), {
		target: { value: "oliver" },
	});
	fireEvent.click(button("Keep as credit"));
	await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
	expect(confirm.mock.calls[0][0].data.housemateId).toBe("oliver");
});

test("a note cannot bypass an incomplete match; exact matches link without adding credit", async () => {
	openReview();
	fireEvent.click(screen.getByRole("checkbox", { name: /Electricity/ }));
	fireEvent.change(note(), {
		target: { value: "These bills were already recorded" },
	});
	fireEvent.click(button("Confirm match · no extra credit"));
	expect(decide).not.toHaveBeenCalled();
	expect(screen.getByRole("alert").textContent).toContain(
		"must equal the bank payment",
	);
	fireEvent.click(screen.getByRole("checkbox", { name: /Internet/ }));
	fireEvent.change(note(), { target: { value: "" } });
	fireEvent.click(button("Confirm match · no extra credit"));
	await waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
	expect(confirm).not.toHaveBeenCalled();
	expect(decide.mock.calls[0][0].data.action).toBe("link");
	expect(decide.mock.calls[0][0].data.manualSourceKeys).toEqual([
		"manual:1",
		"manual:2",
	]);
});

test("excluding a personal payment needs neither a housemate nor a note", async () => {
	openReview({ housemateId: null });
	fireEvent.click(button("Not a household payment"));
	await waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
	expect(decide.mock.calls[0][0].data.action).toBe("exclude");
});

test("server errors stay visible and permit retry", async () => {
	const { onClose } = openReview();
	confirm.mockRejectedValueOnce(
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
	confirm.mockImplementationOnce(() => pending.promise);
	fireEvent.change(note(), { target: { value: "Separate money" } });
	fireEvent.click(button("Keep as credit"));
	const saving = button("Saving…");
	expect(saving.disabled).toBe(true);
	fireEvent.click(saving);
	const form = saving.closest("form");
	if (!form) throw new Error("Review form not rendered");
	fireEvent.submit(form);
	expect(confirm).toHaveBeenCalledTimes(1);
	pending.resolve();
	await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
});
