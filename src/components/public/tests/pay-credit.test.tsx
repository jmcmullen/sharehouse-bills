/// <reference types="bun" />
import "../../../lib/tests/dom";
import { afterEach, expect, test } from "bun:test";
import { createElement } from "react";

const { cleanup, render, screen } = await import("@testing-library/react");
const { CoveredBillsSection, CreditNote } = await import("../pay-credit");

afterEach(cleanup);

const covered = [
	{
		billId: "gas",
		billerName: "Gas",
		billPath: "/bill/gas",
		amount: 30,
		secondary: "1 Aug to 31 Aug",
	},
	{
		billId: "rent",
		billerName: "Rent",
		billPath: "/bill/rent",
		amount: 388.01,
		secondary: "Due Tue 22 Sep",
	},
];

test("covered bills are listed under their own heading with no pay button or overdue copy", () => {
	render(createElement(CoveredBillsSection, { items: covered }));
	expect(
		screen.getByRole("heading", { name: "Covered by your credit" }),
	).toBeTruthy();
	expect(screen.getByText("$418.01 · 2 bills")).toBeTruthy();
	expect(screen.getByText("Gas").closest("a")?.getAttribute("href")).toBe(
		"/bill/gas",
	);
	expect(screen.getByText("$30.00").tagName).toBe("S");
	expect(screen.getAllByText("covered")).toHaveLength(2);
	expect(screen.queryByRole("button")).toBeNull();
	expect(screen.queryByText(/Overdue/)).toBeNull();
});

test("an empty covered list renders nothing", () => {
	const { container } = render(
		createElement(CoveredBillsSection, { items: [] }),
	);
	expect(container.innerHTML).toBe("");
});

test("the credit note says what is held, what is applied and what is left", () => {
	const { container, rerender } = render(
		createElement(CreditNote, {
			credit: { heldAmount: 2976, appliedAmount: 418.01 },
		}),
	);
	expect(container.textContent).toBe(
		"You hold $2,976.00 credit. $418.01 of it covers the bills below, leaving $2,557.99.",
	);
	rerender(
		createElement(CreditNote, {
			credit: { heldAmount: 40, appliedAmount: 40 },
		}),
	);
	expect(container.textContent).toBe(
		"You hold $40.00 credit. All of it covers the bills below.",
	);
	rerender(
		createElement(CreditNote, { credit: { heldAmount: 40, appliedAmount: 0 } }),
	);
	expect(container.textContent).toBe(
		"You hold $40.00 credit. Older bills not shown here use all of it.",
	);
	rerender(
		createElement(CreditNote, { credit: { heldAmount: 0, appliedAmount: 0 } }),
	);
	expect(container.innerHTML).toBe("");
});
