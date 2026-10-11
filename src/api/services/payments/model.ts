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

export interface BankHousemate {
	id: string;
	name: string;
	bankAlias: string | null;
	isOwner: boolean;
}

function normalized(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

export function identifyHousemate(
	transaction: BankTransaction,
	housemates: BankHousemate[],
): BankHousemate | null {
	const senders = [
		transaction.attributes.description,
		transaction.attributes.rawText ?? "",
	].map(normalized);
	const sender = senders.join(" ");
	const message = normalized(transaction.attributes.message ?? "");
	const matches = (text: string, cut: string[] = []): BankHousemate[] =>
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
					name
						.split(" ")
						.every(
							(token) =>
								tokens.has(token) || cut.some((end) => token.startsWith(end)),
						),
			);
		});
	const beneficiaries = namedBeneficiaries(transaction, housemates);
	if (beneficiaries.length > 1) return null;
	const explicit = matches(message);
	if (explicit.length === 1) return explicit[0];
	if (explicit.length > 1) return null;
	if (beneficiaries.length === 1) return beneficiaries[0];
	const found = matches(sender, senders.flatMap(cutName));
	return found.length === 1 ? found[0] : null;
}

// Banks cut long sender names at a fixed width, so the last word of a sender
// field may be the start of a longer name.
function cutName(field: string): string[] {
	const end = field.split(" ").at(-1) ?? "";
	return end.length >= 4 ? [end] : [];
}

export function namedBeneficiaries(
	transaction: BankTransaction,
	housemates: BankHousemate[],
): BankHousemate[] {
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

const householdPattern = /\b(bills?|rent)\b/i;

// A short reference that names the household's bills or rent, with at most a
// date or qualifier around it ("Bills", "Rent 12 Sep", "rent + bills",
// "Bills - Oli"). Only transfers with such a reference confirm themselves.
export function isHouseholdReference(text: string): boolean {
	const reference = text.trim();
	return reference.length <= 40 && householdPattern.test(reference);
}

// The housemate's reference for a transfer, or the bank's description when
// they left none.
export function bankReference(transaction: BankTransaction): string {
	return (
		transaction.attributes.message?.trim() || transaction.attributes.description
	);
}
