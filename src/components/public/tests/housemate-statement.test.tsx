/// <reference types="bun" />
import "../../../lib/tests/dom";
import { afterEach, expect, test } from "bun:test";
import { createElement } from "react";
import type { HousemateStatementData } from "../../../api/services/housemate-statement.server";

const { cleanup, fireEvent, render, screen } = await import(
	"@testing-library/react"
);
const { HousemateStatement } = await import("../housemate-statement");
const { PayFooterActions } = await import("../pay-footer");

afterEach(cleanup);

const at = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

const data: HousemateStatementData = {
	housemate: { name: "Sarah O'Dwyer" },
	headline: { label: "You owe", amount: 106.23 },
	credit: { heldAmount: 50, appliedAmount: 30 },
	timeline: {
		recent: [
			{
				key: "2026-09",
				label: "September 2026",
				items: [
					{
						kind: "payment",
						id: "payment-1",
						at: at("2026-09-17T09:30:00+10:00"),
						label: "Payment received",
						amountCents: 74400,
						heldCents: 0,
						note: "Covered Rent 18 Sep",
						bills: [
							{
								name: "Rent",
								at: at("2026-09-18T00:00:00+10:00"),
								amountCents: 74400,
							},
						],
					},
					{
						kind: "bill",
						id: "bill-cleaners",
						at: at("2026-09-16T00:00:00+10:00"),
						name: "Cleaners",
						amountCents: 3000,
						leftCents: 0,
						creditCents: 3000,
						status: "covered",
						payments: [],
					},
					{
						kind: "bill",
						id: "bill-gas",
						at: at("2026-09-10T00:00:00+10:00"),
						name: "Gas",
						amountCents: 2141,
						leftCents: 1141,
						creditCents: 0,
						status: "overdue",
						payments: [
							{
								label: "Cash received",
								at: at("2026-09-12T18:00:00+10:00"),
								amountCents: 1000,
							},
						],
					},
				],
			},
		],
		earlier: [
			{
				key: "2026-05",
				label: "May 2026",
				items: [
					{
						kind: "bill",
						id: "bill-old",
						at: at("2026-05-10T00:00:00+10:00"),
						name: "Old water",
						amountCents: 5000,
						leftCents: 0,
						creditCents: 0,
						status: "paid",
						payments: [],
					},
				],
			},
		],
	},
};

test("the statement shows the headline, month rows, badges and linked detail", () => {
	render(createElement(HousemateStatement, { data, payPath: "/pay/token-1" }));
	expect(
		screen.getByText("Back to pay").closest("a")?.getAttribute("href"),
	).toBe("/pay/token-1");
	expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("$106.23");
	expect(screen.getByText("You owe")).toBeTruthy();
	expect(screen.getByRole("heading", { name: "September 2026" })).toBeTruthy();
	expect(screen.getByText("Covered by credit")).toBeTruthy();
	expect(screen.getByText("Overdue")).toBeTruthy();
	expect(screen.getByText("Thu, 17 Sep · Covered Rent 18 Sep")).toBeTruthy();
	expect(screen.getByText("Due Thu, 10 Sep · $11.41 left")).toBeTruthy();
	expect(screen.getByText("Cash received Sat, 12 Sep")).toBeTruthy();
	expect(screen.getByText("Rent · due Fri, 18 Sep")).toBeTruthy();
	expect(screen.queryByText(/Balance/)).toBeNull();
});

test("older months wait behind Show earlier", () => {
	render(createElement(HousemateStatement, { data, payPath: "/pay/token-1" }));
	expect(screen.queryByText("Old water")).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Show earlier" }));
	expect(screen.getByText("Old water")).toBeTruthy();
	expect(screen.getByRole("heading", { name: "May 2026" })).toBeTruthy();
	expect(screen.queryByRole("button", { name: "Show earlier" })).toBeNull();
});

test("the pay footer links to the statement above the pay actions, even when nothing is owed", () => {
	const props = {
		statementPath: "/pay/token-1/statement",
		allBillsPath: null,
		payVerb: "Pay all bills",
		payId: null,
		remainingAmount: 100,
		overdueAmount: 40,
	};
	const { rerender } = render(
		createElement(PayFooterActions, { ...props, nothingToPay: false }),
	);
	const labels = [...document.querySelectorAll("a, button")].map(
		(node) => node.textContent,
	);
	expect(labels).toEqual([
		"View statement",
		"Pay overdue only",
		"Pay all bills",
	]);
	expect(
		screen.getByText("View statement").closest("a")?.getAttribute("href"),
	).toBe("/pay/token-1/statement");
	rerender(createElement(PayFooterActions, { ...props, nothingToPay: true }));
	expect(
		[...document.querySelectorAll("a, button")].map((node) => node.textContent),
	).toEqual(["View statement"]);
});
