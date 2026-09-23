/// <reference types="bun" />
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { JSDOM } from "jsdom";
import { createElement } from "react";
import type { decideLedgerTransaction } from "../../../functions/ledger";
import type {
	Payment,
	ReviewPayment as ReviewPaymentComponent,
} from "../review-payment";

type Ready = Parameters<typeof ReviewPaymentComponent>[0]["data"];
type Decision = Parameters<typeof decideLedgerTransaction>[0];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
	url: "http://localhost",
});
for (const name of [
	"window",
	"document",
	"navigator",
	"HTMLElement",
	"HTMLInputElement",
	"HTMLSelectElement",
	"Element",
	"Node",
	"NodeFilter",
	"MutationObserver",
	"CustomEvent",
	"Event",
]) {
	Object.defineProperty(globalThis, name, {
		configurable: true,
		value: name === "window" ? dom.window : Reflect.get(dom.window, name),
	});
}
Object.assign(globalThis, {
	getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
	IS_REACT_ACT_ENVIRONMENT: true,
});

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
	reason: "Possible existing manual payment: compare receipts",
	decision: "review",
	origin: "automatic",
	group: "duplicate",
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
// ReviewPayment reads only accounts and manualPayments from the loader data.
const data = {
	accounts: [{ id: "oliver", name: "Oliver" }],
	manualPayments,
} as unknown as Ready;

function deferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve = (): void => {};
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

const textbox = (): HTMLInputElement =>
	screen.getByRole("textbox") as HTMLInputElement;
const button = (name: string): HTMLButtonElement =>
	screen.getByRole("button", { name }) as HTMLButtonElement;

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

test("short notes explain the requirement; a corrected note credits the selected account", async () => {
	const { onSaved, onClose } = openReview();
	const note = textbox();
	const credit = button("Credit account");
	fireEvent.change(note, { target: { value: " rent " } });
	expect(credit.disabled).toBe(false);
	fireEvent.click(credit);
	expect(decide).not.toHaveBeenCalled();
	expect(screen.getByRole("alert").textContent).toContain(
		"at least 5 characters",
	);
	expect(document.activeElement).toBe(note);
	expect(note.getAttribute("aria-invalid")).toBe("true");
	fireEvent.change(note, { target: { value: "Separate rent payment" } });
	expect(screen.queryByRole("alert")).toBeNull();
	fireEvent.click(credit);
	await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
	expect(onSaved).toHaveBeenCalledTimes(1);
	expect(decide).toHaveBeenCalledWith({
		data: {
			transactionId: "bank-1",
			action: "credit",
			housemateId: "oliver",
			manualSourceKeys: undefined,
			reason: "Separate rent payment",
			expectedRevision: 7,
		},
	});
});

test("a note alone cannot credit an unassigned payment; the form focuses the housemate", async () => {
	openReview({ housemateId: null });
	fireEvent.change(textbox(), {
		target: { value: "Separate payment for bills" },
	});
	fireEvent.click(button("Credit account"));
	expect(decide).not.toHaveBeenCalled();
	expect(screen.getByRole("alert").textContent).toContain(
		"Choose the housemate",
	);
	expect(document.activeElement).toBe(screen.getByRole("combobox"));
	fireEvent.change(screen.getByRole("combobox"), {
		target: { value: "oliver" },
	});
	fireEvent.click(button("Credit account"));
	await waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
});

test("a note cannot bypass an incomplete match; exact matches link without adding credit", async () => {
	openReview();
	fireEvent.click(screen.getByRole("checkbox", { name: /Electricity/ }));
	fireEvent.change(textbox(), {
		target: { value: "These bills were already recorded" },
	});
	fireEvent.click(button("Confirm match · no extra credit"));
	expect(decide).not.toHaveBeenCalled();
	expect(screen.getByRole("alert").textContent).toContain(
		"must equal the bank payment",
	);
	fireEvent.click(screen.getByRole("checkbox", { name: /Internet/ }));
	fireEvent.change(textbox(), { target: { value: "" } });
	fireEvent.click(button("Confirm match · no extra credit"));
	await waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
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
	decide.mockRejectedValueOnce(
		new Error("Payment changed. Refresh and try again."),
	);
	fireEvent.change(textbox(), { target: { value: "Separate money" } });
	fireEvent.click(button("Credit account"));
	await waitFor(() =>
		expect(screen.getByRole("alert").textContent).toContain("Payment changed"),
	);
	expect(onClose).not.toHaveBeenCalled();
	expect(button("Credit account").disabled).toBe(false);
	fireEvent.click(button("Credit account"));
	await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
});

test("saving disables repeat submissions until the request completes", async () => {
	const { onClose } = openReview();
	const pending = deferred();
	decide.mockImplementationOnce(() => pending.promise);
	fireEvent.change(textbox(), { target: { value: "Separate money" } });
	fireEvent.click(button("Credit account"));
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
