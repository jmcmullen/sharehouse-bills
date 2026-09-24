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
// How much of a share the housemate's credit takes, and what is still to pay.
export interface ShareCover {
	coveredCents: number;
	leftCents: number;
}
type CreditBalances = Map<string, Pick<Credit, "amountCents">>;

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

// Applies each housemate's unallocated credit to their shares in the order
// given (due date first), so every view agrees on which bills the money
// already received will settle once the admin allocates it.
export function coverShares<T extends ReminderShare & { housemateId: string }>(
	rows: T[],
	credits: CreditBalances,
): Array<T & ShareCover> {
	const start = (id: string) => credits.get(id)?.amountCents ?? 0;
	return rows.reduce<{
		left: Map<string, number>;
		rows: Array<T & ShareCover>;
	}>(
		(state, row) => {
			const owing = owingCents([row]);
			const left = state.left.get(row.housemateId) ?? start(row.housemateId);
			const coveredCents = Math.min(owing, left);
			return {
				left: new Map(state.left).set(row.housemateId, left - coveredCents),
				rows: [
					...state.rows,
					{ ...row, coveredCents, leftCents: owing - coveredCents },
				],
			};
		},
		{ left: new Map(), rows: [] },
	).rows;
}

// What a message should say about credit against the shares it names.
export function reminderCredit(
	credit: Credit | null | undefined,
	shares: ShareCover[],
): ReminderCredit | null {
	const creditCents = shares.reduce(
		(sum, share) => sum + share.coveredCents,
		0,
	);
	if (!credit || credit.amountCents <= 0 || creditCents <= 0) return null;
	return {
		creditCents,
		receivedAt: credit.receivedAt ? new Date(credit.receivedAt * 1000) : null,
		toPayCents: shares.reduce((sum, share) => sum + share.leftCents, 0),
	};
}
