export interface OpenShare {
	debtId: string;
	billName: string;
	category: string;
	dueAt: number | null;
	remainingCents: number;
}
export interface Suggestion {
	allocations: Array<{ debtId: string; amountCents: number }>;
	confidence: "exact" | "combination" | "partial";
	reason: string;
}
interface SuggestionInput {
	amountCents: number;
	receivedAt: number;
	rentOnly: boolean;
	shares: OpenShare[];
}

// Suggests which open bill shares a payment covers. Suggestions are advisory:
// the admin confirms every allocation, so nothing here writes state.
export function suggestAllocations(input: SuggestionInput): Suggestion | null {
	const open = input.shares
		.filter(
			(share) =>
				share.remainingCents > 0 &&
				(!input.rentOnly || /rent/i.test(share.category)),
		)
		.sort(
			(a, b) =>
				distance(a, input.receivedAt) - distance(b, input.receivedAt) ||
				a.debtId.localeCompare(b.debtId),
		);
	if (!open.length || input.amountCents <= 0) return null;
	const exact = open.find(
		(share) => share.remainingCents === input.amountCents,
	);
	if (exact)
		return {
			allocations: [
				{ debtId: exact.debtId, amountCents: exact.remainingCents },
			],
			confidence: "exact",
			reason: `Exactly matches ${label(exact)}`,
		};
	const combination = exactCombination(open, input.amountCents);
	if (combination)
		return {
			allocations: combination.map((share) => ({
				debtId: share.debtId,
				amountCents: share.remainingCents,
			})),
			confidence: "combination",
			reason: `Exactly covers ${combination.map(label).join(" + ")}`,
		};
	return partial(open, input.amountCents);
}

function distance(share: OpenShare, receivedAt: number): number {
	return share.dueAt === null
		? Number.POSITIVE_INFINITY
		: Math.abs(share.dueAt - receivedAt);
}

// Shares are already ordered by due-date proximity, so the first pair or
// triple found is the nearest-due one of its size.
function exactCombination(
	shares: OpenShare[],
	amount: number,
): OpenShare[] | null {
	return exactGroup(shares, amount, 2) ?? exactGroup(shares, amount, 3);
}

function exactGroup(
	shares: OpenShare[],
	amount: number,
	size: number,
	from = 0,
): OpenShare[] | null {
	if (size === 0) return amount === 0 ? [] : null;
	for (let i = from; i < shares.length; i += 1) {
		const rest = exactGroup(
			shares,
			amount - shares[i].remainingCents,
			size - 1,
			i + 1,
		);
		if (rest) return [shares[i], ...rest];
	}
	return null;
}

function partial(shares: OpenShare[], amount: number): Suggestion {
	const allocations = shares.flatMap((share, index) => {
		const left =
			amount -
			shares
				.slice(0, index)
				.reduce((sum, item) => sum + item.remainingCents, 0);
		return left > 0
			? [
					{
						debtId: share.debtId,
						amountCents: Math.min(left, share.remainingCents),
					},
				]
			: [];
	});
	const allocated = allocations.reduce(
		(sum, item) => sum + item.amountCents,
		0,
	);
	const last = allocations.at(-1);
	const lastShare = shares.find((share) => share.debtId === last?.debtId);
	const names = allocations
		.slice(0, -1)
		.map((item) => shares.find((share) => share.debtId === item.debtId))
		.filter((share): share is OpenShare => share !== undefined)
		.map(label);
	const reason =
		amount > allocated
			? `Covers ${[...names, lastShare ? label(lastShare) : ""].join(" + ")}, ${money(amount - allocated)} left unallocated`
			: `${names.length ? `Covers ${names.join(" + ")}, part-pays` : "Part-pays"} ${lastShare ? label(lastShare) : ""}`;
	return { allocations, confidence: "partial", reason };
}

function label(share: OpenShare): string {
	return share.dueAt === null
		? share.billName
		: `${share.billName} · ${new Intl.DateTimeFormat("en-AU", {
				timeZone: "Australia/Sydney",
				day: "numeric",
				month: "short",
			}).format(new Date(share.dueAt * 1000))}`;
}

function money(cents: number): string {
	return `$${(cents / 100).toFixed(2)}`;
}
