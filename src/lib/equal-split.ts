// Spreads whole cents over a number of people, the first few taking the
// remainder cent each.
export function distributeCents(totalCents: number, count: number): number[] {
	if (count <= 0) return [];
	const total = Math.max(0, totalCents);
	const base = Math.floor(total / count);
	const remainder = total % count;
	return Array.from(
		{ length: count },
		(_, index) => base + (index < remainder ? 1 : 0),
	);
}

// An equal split where every housemate pays the same whole cents. When an
// owner takes part they pay the bill up front, so housemates round up and the
// owners absorb the difference.
export function getEqualSplitCents(input: {
	totalCents: number;
	participantCount: number;
	ownerCount: number;
}) {
	if (input.participantCount <= 0)
		return { perDebtorCents: 0, ownerShareCents: 0, ownerShares: [] };
	const exact = input.totalCents / input.participantCount;
	const perDebtorCents =
		input.ownerCount > 0 ? Math.ceil(exact) : Math.round(exact);
	const nonOwnerCount = Math.max(0, input.participantCount - input.ownerCount);
	const ownerShareCents = input.totalCents - perDebtorCents * nonOwnerCount;
	return {
		perDebtorCents,
		ownerShareCents,
		ownerShares: distributeCents(ownerShareCents, input.ownerCount),
	};
}

export interface Split {
	housemateId: string;
	amountCents: number;
}

// The shares an equal split creates: one per non-owner participant.
export function splitEqually(
	totalCents: number,
	participants: Array<{ housemateId: string; isOwner: boolean }>,
): Split[] {
	const { perDebtorCents } = getEqualSplitCents({
		totalCents,
		participantCount: participants.length,
		ownerCount: participants.filter((item) => item.isOwner).length,
	});
	return participants
		.filter((item) => !item.isOwner)
		.map((item) => ({
			housemateId: item.housemateId,
			amountCents: perDebtorCents,
		}));
}
