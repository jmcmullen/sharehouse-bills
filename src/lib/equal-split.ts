export function roundCurrency(amount: number) {
	return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function roundCurrencyUp(amount: number) {
	return Math.ceil((amount - Number.EPSILON) * 100) / 100;
}

export function distributeCurrencyAmount(totalAmount: number, count: number) {
	if (count <= 0) {
		return [];
	}

	const totalCents = Math.max(
		0,
		Math.round((totalAmount + Number.EPSILON) * 100),
	);
	const baseCents = Math.floor(totalCents / count);
	const remainderCents = totalCents % count;

	return Array.from(
		{ length: count },
		(_, index) => (baseCents + (index < remainderCents ? 1 : 0)) / 100,
	);
}

export function getEqualSplitAmounts(input: {
	totalAmount: number;
	participantCount: number;
	ownerCount: number;
}) {
	if (input.participantCount <= 0) {
		return {
			amountPerDebtor: 0,
			ownerShareTotal: 0,
			ownerShares: [],
		};
	}

	const amountPerDebtor =
		input.ownerCount > 0
			? roundCurrencyUp(input.totalAmount / input.participantCount)
			: roundCurrency(input.totalAmount / input.participantCount);
	const nonOwnerCount = Math.max(0, input.participantCount - input.ownerCount);
	const ownerShareTotal = roundCurrency(
		input.totalAmount - amountPerDebtor * nonOwnerCount,
	);

	return {
		amountPerDebtor,
		ownerShareTotal,
		ownerShares: distributeCurrencyAmount(ownerShareTotal, input.ownerCount),
	};
}
