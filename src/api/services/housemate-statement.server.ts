import { eq } from "drizzle-orm";
import { db } from "../db/index.server";
import { housemates } from "../db/schema/housemates";
import { buildPaySummary, toPayShare } from "./housemate-pay-summary";
import { getAccountPayments } from "./ledger/account-payments";
import { createLedgerClient } from "./ledger/client.server";
import { dayInSydney } from "./ledger/model";
import { nowSeconds } from "./ledger/sources";
import { parsePayToken } from "./pay-token.server";
import {
	buildStatementTimeline,
	statementHeadline,
} from "./statement-timeline";
import { getCoveredShares } from "./unpaid-shares.server";

async function findHousemate(id: string) {
	const [housemate] = await db
		.select({ id: housemates.id, name: housemates.name })
		.from(housemates)
		.where(eq(housemates.id, id))
		.limit(1);
	return housemate ?? null;
}

async function loadAccount(housemateId: string, now: number) {
	const client = createLedgerClient();
	try {
		return await getAccountPayments(client, housemateId, now);
	} finally {
		client.close();
	}
}

// The housemate's statement behind their pay link. Any scope of pay link
// opens the whole account, with the same credit cover as the pay page.
export async function getHousemateStatementData(token: string) {
	const parsed = parsePayToken(token.trim());
	if (!parsed) return null;
	const housemate = await findHousemate(parsed.housemateId);
	if (!housemate) return null;
	const now = nowSeconds();
	const [covered, account] = await Promise.all([
		getCoveredShares(housemate.id),
		loadAccount(housemate.id, now),
	]);
	const today = dayInSydney(now);
	const totals = buildPaySummary(
		covered.shares.map((share) =>
			toPayShare(share, dayInSydney(share.dueDate.getTime() / 1000) < today),
		),
		covered.credit.amountCents / 100,
	);
	return {
		housemate: { name: housemate.name },
		headline: statementHeadline(totals),
		credit: totals.credit,
		timeline: buildStatementTimeline({
			bills: account.bills,
			receipts: account.receipts,
			cover: covered.shares,
			now,
		}),
	};
}

export type HousemateStatementData = NonNullable<
	Awaited<ReturnType<typeof getHousemateStatementData>>
>;
