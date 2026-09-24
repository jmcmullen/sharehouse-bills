import assert from "node:assert/strict";
import { test } from "node:test";
import { createPayToken, parsePayToken } from "../pay-token.server";

process.env.REMINDER_LINK_SECRET = "pay-token-test-secret";

function token(input: Parameters<typeof createPayToken>[0]) {
	const value = createPayToken(input);
	assert.ok(value);
	return value;
}

test("every pay link scope resolves to its housemate", () => {
	assert.deepEqual(parsePayToken(token({ housemateId: "sarah" })), {
		housemateId: "sarah",
		scope: { kind: "all", stackGroup: null, billIds: null },
	});
	assert.deepEqual(
		parsePayToken(token({ housemateId: "sarah", stackGroup: "utilities" })),
		{
			housemateId: "sarah",
			scope: { kind: "stack", stackGroup: "utilities", billIds: null },
		},
	);
	assert.deepEqual(
		parsePayToken(token({ housemateId: "sarah", billIds: ["rent", "gas"] })),
		{
			housemateId: "sarah",
			scope: { kind: "bills", stackGroup: null, billIds: ["gas", "rent"] },
		},
	);
});

test("tampered, foreign and malformed tokens resolve to nothing", () => {
	const valid = token({ housemateId: "sarah" });
	const [kind, , signature] = valid.split(".");
	assert.equal(parsePayToken(`${kind}.oliver.${signature}`), null);
	assert.equal(parsePayToken(`${valid.slice(0, -1)}x`), null);
	assert.equal(parsePayToken("all.sarah"), null);
	assert.equal(parsePayToken(""), null);
	assert.equal(parsePayToken("nonsense"), null);
});
