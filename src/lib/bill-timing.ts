// Bill dates are read on the Sydney calendar, whatever the server's zone.
const sydneyParts = new Intl.DateTimeFormat("en-CA", {
	timeZone: "Australia/Sydney",
	year: "numeric",
	month: "numeric",
	day: "numeric",
});
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];
const DAY_MS = 86_400_000;

interface SydneyDay {
	year: number;
	month: number;
	day: number;
}

function sydneyDay(date: Date | string): SydneyDay {
	const parts = sydneyParts.formatToParts(new Date(date));
	const part = (type: Intl.DateTimeFormatPartTypes) =>
		Number(parts.find((item) => item.type === type)?.value);
	return { year: part("year"), month: part("month"), day: part("day") };
}

function dayNumber(day: SydneyDay) {
	return Date.UTC(day.year, day.month - 1, day.day) / DAY_MS;
}

// Whole Sydney calendar days from `from` to `to`; negative when `to` is earlier.
export function sydneyDaysBetween(from: Date | string, to: Date | string) {
	return dayNumber(sydneyDay(to)) - dayNumber(sydneyDay(from));
}

// "Fri 18 Sep", with the year only when it is not the current Sydney year.
export function formatDueDate(date: Date | string, now: Date = new Date()) {
	const day = sydneyDay(date);
	const weekday = WEEKDAYS[new Date(dayNumber(day) * DAY_MS).getUTCDay()];
	const label = `${weekday} ${day.day} ${MONTHS[day.month - 1]}`;
	return day.year === sydneyDay(now).year ? label : `${label} ${day.year}`;
}

function wholeMonths(from: SydneyDay, to: SydneyDay) {
	const months = (to.year - from.year) * 12 + to.month - from.month;
	return to.day < from.day ? months - 1 : months;
}

function plural(count: number, unit: string) {
	return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

function formatGap(earlier: Date | string, later: Date | string) {
	const days = sydneyDaysBetween(earlier, later);
	if (days < 14) return plural(days, "day");
	if (days <= 56) return plural(Math.floor(days / 7), "week");
	const months = wholeMonths(sydneyDay(earlier), sydneyDay(later));
	return plural(Math.max(2, months), "month");
}

// "3 days early", "on the due date", "2 weeks late".
export function formatTiming(dueDate: Date | string, paidDate: Date | string) {
	const days = sydneyDaysBetween(dueDate, paidDate);
	if (days === 0) return "on the due date";
	return days < 0
		? `${formatGap(paidDate, dueDate)} early`
		: `${formatGap(dueDate, paidDate)} late`;
}

// "Paid 3 days early", "Paid on the due date", "Paid 2 weeks late".
export function formatPaidTiming(
	dueDate: Date | string,
	paidDate: Date | string,
) {
	return `Paid ${formatTiming(dueDate, paidDate)}`;
}
