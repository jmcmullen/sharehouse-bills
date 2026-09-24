import { formatReminderBillLabel } from "../../lib/reminder-preview";
import { type ShareCover, reminderCredit } from "./bill-reminder-credit";
import type { Credit } from "./ledger/credit.server";

const DAY_MS = 24 * 60 * 60 * 1000;
const sydneyDay = new Intl.DateTimeFormat("en-CA", {
	timeZone: "Australia/Sydney",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

interface DigestShare extends ShareCover {
	billId: string;
	billerName: string;
	recurringTemplateName: string | null;
	dueDate: Date;
}
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
export function sydneyDate(date: Date): string {
	return sydneyDay.format(date);
}

export function overdueDigestKey(housemateId: string, now: Date): string {
	return `overdue-digest:${housemateId}:${sydneyDate(now)}`;
}

function daysBetween(from: string, to: string) {
	return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

// What a housemate still owes on bills due before today in Sydney, after
// their held credit is applied oldest first. Null when nothing is overdue.
export function buildOverdueDigest(
	shares: DigestShare[],
	credit: Credit | null,
	now: Date,
): OverdueDigest | null {
	const today = sydneyDate(now);
	const overdue = shares.filter((share) => sydneyDate(share.dueDate) < today);
	const items = overdue
		.filter((share) => share.leftCents > 0)
		.map((share) => ({
			billId: share.billId,
			label: formatReminderBillLabel(share),
			amountCents: share.leftCents,
			daysOverdue: daysBetween(sydneyDate(share.dueDate), today),
		}));
	if (!items.length) return null;
	return {
		date: today,
		items,
		overdueCents: items.reduce((sum, item) => sum + item.amountCents, 0),
		creditCents: reminderCredit(credit, overdue)?.creditCents ?? 0,
	};
}
