import type { Credit } from "./ledger/credit.server";

interface ReminderShare {
	amountOwed: number;
	amountPaid: number | null;
}
interface ReminderCredit {
	creditCents: number;
	receivedAt: Date | null;
	toPayCents: number;
}

export function owingCents(shares: ReminderShare[]): number {
	return shares.reduce(
		(sum, share) =>
			sum +
			Math.max(
				0,
				Math.round((share.amountOwed - (share.amountPaid ?? 0)) * 100),
			),
		0,
	);
}

// Drops the shares that a housemate's unallocated credit already covers, in
// the order given (due date first), so nobody is reminded about money that
// has arrived but is still waiting for the admin to allocate it.
export function uncoveredShares<
	T extends ReminderShare & { housemateId: string },
>(rows: T[], credits: Map<string, Pick<Credit, "amountCents">>): T[] {
	const left = new Map(
		[...credits].map(([id, credit]) => [id, credit.amountCents]),
	);
	return rows.filter((row) => {
		const remaining = owingCents([row]);
		const credit = left.get(row.housemateId) ?? 0;
		left.set(row.housemateId, Math.max(0, credit - remaining));
		return credit < remaining;
	});
}

// What a reminder should say about credit against the shares it names.
export function reminderCredit(
	credit: Credit | null | undefined,
	owing: number,
): ReminderCredit | null {
	if (!credit || credit.amountCents <= 0) return null;
	return {
		creditCents: Math.min(credit.amountCents, owing),
		receivedAt: credit.receivedAt ? new Date(credit.receivedAt * 1000) : null,
		toPayCents: Math.max(0, owing - credit.amountCents),
	};
}
