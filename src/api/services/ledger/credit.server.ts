import { getAccountPayments } from "./account-payments";
import { createLedgerClient } from "./client.server";

// Money received that no bill share has claimed yet, in dollars per housemate.
export async function getUnallocatedCredits(
	housemateIds: string[],
): Promise<Map<string, number>> {
	const ids = [...new Set(housemateIds)];
	if (!ids.length) return new Map();
	const client = createLedgerClient();
	try {
		const credits = await Promise.all(
			ids.map(async (id) => {
				const account = await getAccountPayments(client, id);
				return [id, Math.max(0, account.unallocatedCents) / 100] as const;
			}),
		);
		return new Map(credits);
	} finally {
		client.close();
	}
}

export async function getUnallocatedCredit(
	housemateId: string,
): Promise<number> {
	return (await getUnallocatedCredits([housemateId])).get(housemateId) ?? 0;
}
