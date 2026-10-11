import { loadAccount } from "./account/account.server";
import { statementHeadline } from "./account/compute";
import { buildStatement } from "./account/statement";
import { parsePayToken } from "./pay-token.server";

// The housemate's statement behind their pay link. Any scope of pay link
// opens the whole account, with the same credit cover as the pay page.
export async function getHousemateStatementData(token: string) {
	const parsed = parsePayToken(token.trim());
	if (!parsed) return null;
	const now = Math.floor(Date.now() / 1000);
	const account = await loadAccount(parsed.housemateId, { now });
	if (!account) return null;
	return {
		housemate: { name: account.housemate.name },
		headline: statementHeadline(account),
		credit: {
			heldCents: account.creditCents,
			appliedCents: account.coveredCents,
		},
		timeline: buildStatement(account, now),
	};
}

export type HousemateStatementData = NonNullable<
	Awaited<ReturnType<typeof getHousemateStatementData>>
>;
