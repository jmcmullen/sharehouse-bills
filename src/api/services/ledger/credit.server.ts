import type { Client } from "@libsql/client";
import { getAccountPayments } from "./account-payments";
import { createLedgerClient } from "./client.server";

// Money received that no bill share has claimed yet, and when it arrived if
// it all came in one payment so a message can name that payment.
export interface Credit {
	amountCents: number;
	receivedAt: number | null;
}

async function creditFor(client: Client, housemateId: string): Promise<Credit> {
	const account = await getAccountPayments(client, housemateId);
	const open = account.receipts.filter(
		(receipt) => receipt.unallocatedCents > 0,
	);
	return {
		amountCents: Math.max(0, account.unallocatedCents),
		receivedAt: open.length === 1 ? (open[0]?.receivedAt ?? null) : null,
	};
}

export async function getCredits(
	housemateIds: string[],
): Promise<Map<string, Credit>> {
	const ids = [...new Set(housemateIds)];
	if (!ids.length) return new Map();
	const client = createLedgerClient();
	try {
		return new Map(
			await Promise.all(
				ids.map(async (id) => [id, await creditFor(client, id)] as const),
			),
		);
	} finally {
		client.close();
	}
}

export async function getCredit(housemateId: string): Promise<Credit> {
	return (
		(await getCredits([housemateId])).get(housemateId) ?? {
			amountCents: 0,
			receivedAt: null,
		}
	);
}

// Unallocated credit in dollars per housemate, for the dollar-based views.
export async function getUnallocatedCredits(
	housemateIds: string[],
): Promise<Map<string, number>> {
	return new Map(
		[...(await getCredits(housemateIds))].map(([id, credit]) => [
			id,
			credit.amountCents / 100,
		]),
	);
}

export async function getUnallocatedCredit(
	housemateId: string,
): Promise<number> {
	return (await getCredit(housemateId)).amountCents / 100;
}
