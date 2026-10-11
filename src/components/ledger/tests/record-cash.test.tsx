/// <reference types="bun" />
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import "../../../lib/tests/dom";
import { createElement } from "react";
import type { AccountPayments } from "../../../api/services/payments/account-payments";
import type { recordCashReceived } from "../../../functions/ledger";

type Cash = Parameters<typeof recordCashReceived>[0];

const record = mock(async (_input: Cash): Promise<void> => {});
// Bun shares module mocks across test files, so every ledger component test
// mocks the same server functions.
mock.module("../../../functions/ledger", () => ({
	decideLedgerTransaction: mock(async () => {}),
	recordCashReceived: record,
}));
const { cleanup, fireEvent, render, screen, waitFor } = await import(
	"@testing-library/react"
);
const { RecordCash } = await import("../record-cash");

const week = 7 * 86400;
const due = 1788825600;
const bill = (
	id: string,
	name: string,
	amountCents: number,
	dueAt: number,
	paidCents = 0,
) => ({
	id,
	billId: `bill-${id}`,
	housemateId: "oliver",
	isOwner: false,
	name,
	billType: null,
	category: name.toLowerCase(),
	stackGroup: null,
	recurringTemplateName: null,
	dueAt,
	billPeriodStart: null,
	billPeriodEnd: null,
	amountCents,
	paidCents,
	remainingCents: amountCents - paidCents,
	settledAt: null,
	overdue: false,
	coveredCents: 0,
	leftCents: amountCents - paidCents,
	payments: [],
});
// Newest first, as the account lists them.
const billing: AccountPayments = {
	revision: "r1",
	bills: [
		bill("water", "Water", 4000, due),
		bill("gas", "Gas", 6000, due - week, 1000),
		bill("rent", "Rent", 30000, due - 2 * week),
	],
	receipts: [],
	unallocatedCents: 0,
	unpaidCents: 39000,
};

const field = (name: RegExp): HTMLInputElement =>
	screen.getByRole("spinbutton", { name }) as HTMLInputElement;
const save = (): HTMLButtonElement =>
	screen.getByRole("button", { name: "Record cash" }) as HTMLButtonElement;

function open() {
	const onSaved = mock(async () => {});
	const onClose = mock(() => {});
	render(
		createElement(RecordCash, {
			housemateId: "oliver",
			housemateName: "Oliver",
			billing,
			onClose,
			onSaved,
		}),
	);
	return { onSaved, onClose };
}

beforeEach(() => {
	record.mockReset();
	record.mockImplementation(async () => {});
});
afterEach(cleanup);

test("proposes the oldest bills first and records one cash payment", async () => {
	const { onSaved, onClose } = open();
	expect(save().disabled).toBe(true);
	fireEvent.change(screen.getByLabelText("Amount"), {
		target: { value: "320" },
	});
	expect(field(/Rent/).value).toBe("300.00");
	expect(field(/Gas/).value).toBe("20.00");
	expect(field(/Water/).value).toBe("");
	expect(screen.getByRole("status").textContent).toBe(
		"All of the cash is allocated.",
	);
	fireEvent.change(field(/Gas/), { target: { value: "" } });
	expect(screen.getByRole("status").textContent).toBe("$20.00 held as credit");
	fireEvent.click(
		screen.getByRole("button", { name: "Reset to oldest first" }),
	);
	expect(field(/Gas/).value).toBe("20.00");
	fireEvent.click(save());
	await waitFor(() => expect(onClose).toHaveBeenCalled());
	expect(onSaved).toHaveBeenCalled();
	const { data } = record.mock.calls[0][0];
	expect(data.housemateId).toBe("oliver");
	expect(data.amountCents).toBe(32000);
	expect(data.expectedRevision).toBe("r1");
	expect(data.allocations).toEqual([
		{ debtId: "rent", amountCents: 30000 },
		{ debtId: "gas", amountCents: 2000 },
	]);
});

test("over-allocating disables saving", () => {
	open();
	fireEvent.change(screen.getByLabelText("Amount"), {
		target: { value: "50" },
	});
	fireEvent.change(field(/Water/), { target: { value: "10" } });
	expect(screen.getByRole("status").textContent).toContain(
		"$10.00 more than the cash received",
	);
	expect(save().disabled).toBe(true);
	fireEvent.change(field(/Rent/), { target: { value: "40" } });
	expect(save().disabled).toBe(false);
});
