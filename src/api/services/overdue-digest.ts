import { formatReminderBillLabel } from "../../lib/reminder-preview";
import type { Share } from "./account/account";
import { sum, sydneyDate } from "./account/compute";

const DAY_MS = 24 * 60 * 60 * 1000;

type DigestShare = Pick<
	Share,
	| "billId"
	| "name"
	| "recurringTemplateName"
	| "dueAt"
	| "coveredCents"
	| "leftCents"
>;
interface OverdueDigestItem {
	billId: string;
	label: string;
	amountCents: number;
	daysOverdue: number;
}
export interface OverdueDigest {
	date: string;
	items: OverdueDigestItem[];
	overdueCents: number;
	creditCents: number;
}

// The calendar day in Sydney, as YYYY-MM-DD, so "overdue" and the once-a-day
// key follow the house's clock rather than UTC.
export function digestDate(date: Date): string {
	return sydneyDate(Math.floor(date.getTime() / 1000));
}

export function overdueDigestKey(housemateId: string, now: Date): string {
	return `overdue-digest:${housemateId}:${digestDate(now)}`;
}

function daysBetween(from: string, to: string) {
	return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

// What a housemate still owes on bills due before today in Sydney, from the
// account's shares with held credit already applied oldest first. Null when
// nothing is overdue.
export function buildOverdueDigest(
	shares: DigestShare[],
	now: Date,
): OverdueDigest | null {
	const today = digestDate(now);
	const overdue = shares.filter((share) => sydneyDate(share.dueAt) < today);
	const items = overdue
		.filter((share) => share.leftCents > 0)
		.map((share) => ({
			billId: share.billId,
			label: formatReminderBillLabel({
				billerName: share.name,
				recurringTemplateName: share.recurringTemplateName,
			}),
			amountCents: share.leftCents,
			daysOverdue: daysBetween(sydneyDate(share.dueAt), today),
		}));
	if (!items.length) return null;
	return {
		date: today,
		items,
		overdueCents: sum(items, (item) => item.amountCents),
		creditCents: sum(overdue, (share) => share.coveredCents),
	};
}
