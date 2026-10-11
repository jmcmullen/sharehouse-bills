import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRecurringSplits } from "../recurring-bill";

const template = (splitStrategy: "equal" | "custom", totalCents = 189000) => ({
	templateName: "Rent",
	totalCents,
	splitStrategy,
});
const assignment = (
	housemateId: string,
	isOwner: boolean,
	customCents: number | null = null,
) => ({ housemateId, name: housemateId, isOwner, customCents });

test("an equal recurring split gives each non-owner the same cents", () => {
	assert.deepEqual(
		buildRecurringSplits(template("equal", 100000), [
			assignment("jay", true),
			assignment("oliver", false),
			assignment("sarah", false),
		]),
		[
			{ housemateId: "oliver", amountCents: 33334 },
			{ housemateId: "sarah", amountCents: 33334 },
		],
	);
});

test("a custom recurring split uses each housemate's cents exactly", () => {
	assert.deepEqual(
		buildRecurringSplits(template("custom"), [
			assignment("oliver", false, 94500),
			assignment("sarah", false, 94500),
		]),
		[
			{ housemateId: "oliver", amountCents: 94500 },
			{ housemateId: "sarah", amountCents: 94500 },
		],
	);
});

test("custom amounts must add up to the cent without an owner and never exceed it", () => {
	const cases = [
		{
			assignments: [
				assignment("oliver", false, 94500),
				assignment("sarah", false, 94499),
			],
			error: /must equal/,
		},
		{
			assignments: [
				assignment("jay", true),
				assignment("oliver", false, 189001),
			],
			error: /exceed/,
		},
		{ assignments: [assignment("oliver", false, null)], error: /required/ },
		{ assignments: [assignment("jay", true)], error: /non-owner/ },
		{ assignments: [], error: /No active assignments/ },
	];
	for (const item of cases)
		assert.throws(
			() => buildRecurringSplits(template("custom"), item.assignments),
			item.error,
		);
	assert.deepEqual(
		buildRecurringSplits(template("custom"), [
			assignment("jay", true),
			assignment("oliver", false, 100000),
		]),
		[{ housemateId: "oliver", amountCents: 100000 }],
	);
});
