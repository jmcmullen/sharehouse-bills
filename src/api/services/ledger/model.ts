import { z } from "zod";

export const bankTransactionSchema = z
	.object({
		id: z.string().min(1),
		attributes: z
			.object({
				status: z.enum(["HELD", "SETTLED"]),
				description: z.string(),
				rawText: z.string().nullable().optional(),
				message: z.string().nullable().optional(),
				transactionType: z.string().nullable().optional(),
				createdAt: z.iso.datetime({ offset: true }),
				settledAt: z.iso.datetime({ offset: true }).nullable().optional(),
				amount: z.object({
					currencyCode: z.string(),
					valueInBaseUnits: z.number().int().safe(),
				}),
			})
			.passthrough(),
		relationships: z
			.object({
				account: z.object({ data: z.object({ id: z.string() }) }),
				transferAccount: z.object({ data: z.unknown().nullable() }).optional(),
			})
			.optional(),
	})
	.passthrough();
export type BankTransaction = z.infer<typeof bankTransactionSchema>;

export const sourceSchema = z.object({
	housemateId: z.string().min(1),
	amountCents: z.number().int().safe(),
	kind: z.enum(["charge", "payment", "adjustment", "refund"]),
	description: z.string(),
	billId: z.string().nullable(),
	effectiveAt: z.number().int(),
	dueAt: z.number().int().nullable(),
});
export type LedgerSource = z.infer<typeof sourceSchema>;
export interface LedgerHousemate {
	id: string;
	name: string;
	bankAlias: string | null;
	isOwner: boolean;
}

export function toCents(amount: number): number {
	const result = Math.round((amount + Number.EPSILON) * 100);
	if (!Number.isSafeInteger(result)) throw new Error("Invalid money amount");
	return result;
}

function normalized(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

export function identifyHousemate(
	transaction: BankTransaction,
	housemates: LedgerHousemate[],
): LedgerHousemate | null {
	const sender = normalized(
		`${transaction.attributes.description} ${transaction.attributes.rawText ?? ""}`,
	);
	const message = normalized(transaction.attributes.message ?? "");
	const matches = (text: string): LedgerHousemate[] =>
		housemates.filter((housemate) => {
			if (housemate.isOwner) return false;
			const names = [
				housemate.name,
				...(housemate.bankAlias?.split(/[,;|\n/]/) ?? []),
			].map(normalized);
			const tokens = new Set(text.split(" "));
			return names.some(
				(name) =>
					name.length > 2 &&
					name.split(" ").every((token) => tokens.has(token)),
			);
		});
	const beneficiaries = namedBeneficiaries(transaction, housemates);
	if (beneficiaries.length > 1) return null;
	const explicit = matches(message);
	if (explicit.length === 1) return explicit[0];
	if (explicit.length > 1) return null;
	if (beneficiaries.length === 1) return beneficiaries[0];
	const senders = matches(sender);
	if (senders.length === 1) return senders[0];
	if (senders.length > 1) return null;
	return null;
}

export function namedBeneficiaries(
	transaction: BankTransaction,
	housemates: LedgerHousemate[],
): LedgerHousemate[] {
	const tokens = new Set(
		normalized(transaction.attributes.message ?? "").split(" "),
	);
	return housemates.filter((housemate) => {
		if (housemate.isOwner) return false;
		const names = [
			housemate.name,
			...(housemate.bankAlias?.split(/[,;|\n]/) ?? []),
		];
		return names.some((name) => {
			const first = normalized(name).split(" ")[0];
			return first.length > 0 && tokens.has(first);
		});
	});
}

const utilityPattern =
	/\b(cleaners?|cleaning|bills?|gas|electricity|water|internets?|pool)\b/i;

// A reference that names rent and nothing else; such money only pays rent bills.
export function isRentReference(text: string): boolean {
	return /\brent\b/i.test(text) && !utilityPattern.test(text);
}

export interface StatementEntry extends LedgerSource {
	id: string;
	sourceKey: string;
	recordedAt: number;
	reversesEntryId: string | null;
}
export interface StatementRow extends StatementEntry {
	runningBalanceCents: number;
}
export interface AccountStatement {
	entries: StatementRow[];
	balanceCents: number;
	dueNowCents: number;
	upcomingCents: number;
	creditCents: number;
}

export function currentStatement(
	statement: AccountStatement,
	now: number,
): AccountStatement {
	const reversed = new Set(
		statement.entries.flatMap((entry) =>
			entry.reversesEntryId ? [entry.reversesEntryId] : [],
		),
	);
	return calculateStatement(
		statement.entries.filter(
			(entry) => !entry.reversesEntryId && !reversed.has(entry.id),
		),
		now,
	);
}

export function dayInSydney(seconds: number): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Australia/Sydney",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date(seconds * 1000));
}

export function calculateStatement(
	entries: StatementEntry[],
	now: number,
): AccountStatement {
	const ordered = [...entries]
		.filter((entry) => entry.effectiveAt <= now)
		.sort(
			(a, b) =>
				a.effectiveAt - b.effectiveAt ||
				a.recordedAt - b.recordedAt ||
				a.id.localeCompare(b.id),
		);
	const rows = ordered.map((entry, index) => ({
		...entry,
		runningBalanceCents: ordered
			.slice(0, index + 1)
			.reduce((sum, item) => sum + item.amountCents, 0),
	}));
	const balanceCents = rows.at(-1)?.runningBalanceCents ?? 0;
	return {
		entries: rows,
		balanceCents,
		dueNowCents: Math.max(0, balanceCents),
		upcomingCents: 0,
		creditCents: Math.max(0, -balanceCents),
	};
}

// Money owed on bills not yet due is upcoming, not due now. The caller knows
// how much of those bills is still unpaid, since paid future bills owe nothing.
export function withUpcoming(
	statement: AccountStatement,
	upcomingCents: number,
): AccountStatement {
	const dueNowCents = Math.max(0, statement.balanceCents - upcomingCents);
	return {
		...statement,
		dueNowCents,
		upcomingCents: Math.max(0, statement.balanceCents - dueNowCents),
	};
}
