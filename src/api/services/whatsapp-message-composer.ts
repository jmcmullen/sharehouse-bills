import { formatDueDate, formatTiming } from "../../lib/bill-timing";
import { formatCurrency } from "../../lib/share-preview";

function getLowercaseFirstNames(names: string[]) {
	return [
		...new Set(
			names
				.map((name) => name.trim().split(/\s+/)[0]?.toLowerCase() ?? "")
				.filter(Boolean),
		),
	];
}

function buildOnBehalfExamples(names: string[]) {
	const firstNames = getLowercaseFirstNames(names);
	if (firstNames.length === 0) {
		return [];
	}

	return [
		"If you're paying for someone else:",
		...firstNames.map((firstName) => `- \`bills for ${firstName}\``),
	];
}

export function buildDueCommandNotFoundSummary(firstName: string) {
	return `*Couldn't find ${firstName}.* Try the first name exactly as it appears in the app.`;
}

export function buildNotAllowedSummary() {
	return "*Not allowed.*";
}

export function buildUnknownHousematePaySummary() {
	return [
		"*Couldn't match this WhatsApp number to a housemate.*",
		"Ask the admin to update your WhatsApp number in the app.",
	].join("\n");
}

export function buildPayLinkSummary(input: {
	payUrl: string;
	housemateName: string;
	housemateFirstNames: string[];
}) {
	const otherHousemateNames = getLowercaseFirstNames(
		input.housemateFirstNames.filter((name) => {
			const firstName = name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
			return (
				firstName !== input.housemateName.trim().split(/\s+/)[0]?.toLowerCase()
			);
		}),
	);

	return [
		`*${input.housemateName}, here's your pay link:*`,
		input.payUrl,
		"",
		"Use `bills` in the transfer note.",
		...buildOnBehalfExamples(otherHousemateNames),
	].join("\n");
}

export function buildInitIntroSummary() {
	return [
		"House, please welcome our new flatmate: *Owen Money*.",
		"",
		"Owen keeps track of bills, remembers who still owes, and communicates mainly through links.",
	].join("\n");
}

export function buildInitBillsSummary(input: {
	asOf: Date;
	totalOutstanding: number;
	bills: Array<{
		billerName: string;
		remainingAmount: number;
		billCount: number;
	}>;
}) {
	if (input.bills.length === 0) {
		return [
			`*Current unpaid bills as of ${new Intl.DateTimeFormat("en-AU", {
				day: "numeric",
				month: "short",
				year: "numeric",
			}).format(input.asOf)}*`,
			"",
			"No unpaid or partially paid bills.",
		].join("\n");
	}

	return [
		`*Current unpaid bills as of ${new Intl.DateTimeFormat("en-AU", {
			day: "numeric",
			month: "short",
			year: "numeric",
		}).format(input.asOf)}*`,
		"",
		...input.bills.map(
			(bill, index) =>
				`${index + 1}. ${bill.billerName}\n${formatCurrency(bill.remainingAmount)}${bill.billCount > 1 ? ` across ${bill.billCount} bills` : ""}`,
		),
		"",
		`Total: ${formatCurrency(input.totalOutstanding)}`,
	].join("\n");
}

export function buildAdminPayLinksSummary(input: {
	sentHousemateNames: string[];
	skippedRecipients: Array<{
		housemateName: string;
		reason: "missing_whatsapp_number" | "missing_pay_url";
	}>;
}) {
	const lines = [
		`Sent pay links to ${input.sentHousemateNames.length} ${input.sentHousemateNames.length === 1 ? "housemate" : "housemates"}.`,
	];

	if (input.sentHousemateNames.length > 0) {
		lines.push(...input.sentHousemateNames.map((name) => `- ${name}`));
	}

	if (input.skippedRecipients.length > 0) {
		lines.push("", "Skipped:");
		lines.push(
			...input.skippedRecipients.map((recipient) => {
				const reason =
					recipient.reason === "missing_whatsapp_number"
						? "missing WhatsApp number"
						: "missing pay link";
				return `- ${recipient.housemateName} (${reason})`;
			}),
		);
	}

	return lines.join("\n");
}

export function buildBillPaidSummary(input: { billUrl: string }) {
	return input.billUrl;
}

interface ReceiptLine {
	billName: string;
	dueDate: Date | null;
	amountCents: number;
}
interface PaymentReceiptInput {
	firstName: string;
	amountCents: number;
	receivedAt: Date;
	covered: ReceiptLine[];
	creditCents: number;
	balanceCents: number;
}
interface PaymentCorrectionInput extends Omit<PaymentReceiptInput, "covered"> {
	before: ReceiptLine[];
	after: ReceiptLine[];
}

function cents(amount: number) {
	return formatCurrency(amount / 100);
}

// The day money arrived, read against its own year.
function formatReceivedDate(date: Date) {
	return formatDueDate(date, date);
}

// "- Rent (due Fri 18 Sep) · $372.00 · 3 days early", timed against the day
// this payment arrived.
function receiptLines(lines: ReceiptLine[], receivedAt: Date) {
	return lines.map(({ billName, dueDate, amountCents }) =>
		dueDate
			? `- ${billName} (due ${formatDueDate(dueDate, receivedAt)}) · ${cents(amountCents)} · ${formatTiming(dueDate, receivedAt)}`
			: `- ${billName} · ${cents(amountCents)}`,
	);
}

function balanceLine(balanceCents: number) {
	if (balanceCents > 0) return `You still owe ${cents(balanceCents)}.`;
	if (balanceCents < 0) return `You're ${cents(-balanceCents)} in credit.`;
	return "You're all settled up.";
}

function receiptFooter(input: Pick<PaymentReceiptInput, "balanceCents">) {
	return [balanceLine(input.balanceCents)];
}

export function buildPaymentReceiptSummary(input: PaymentReceiptInput) {
	const header = [
		`*Thanks ${input.firstName}, payment received*`,
		`${cents(input.amountCents)} on ${formatReceivedDate(input.receivedAt)}`,
		"",
	];
	if (!input.covered.length)
		return [
			...header,
			"This payment is held as credit for your next bill.",
			...receiptFooter(input),
		].join("\n");
	return [
		...header,
		"Covers:",
		...receiptLines(input.covered, input.receivedAt),
		"",
		...(input.creditCents > 0
			? [`${cents(input.creditCents)} is held as credit for your next bill.`]
			: []),
		...receiptFooter(input),
	].join("\n");
}

export function buildPaymentCorrectionSummary(input: PaymentCorrectionInput) {
	return [
		`*${input.firstName}, a correction to your payment*`,
		`${cents(input.amountCents)} on ${formatReceivedDate(input.receivedAt)}`,
		"",
		...(input.before.length
			? ["Previously covered:", ...receiptLines(input.before, input.receivedAt)]
			: ["Previously held as credit."]),
		"",
		...(input.after.length
			? [
					"Now covers:",
					...receiptLines(input.after, input.receivedAt),
					...(input.creditCents > 0
						? [
								`${cents(input.creditCents)} is held as credit for your next bill.`,
							]
						: []),
				]
			: ["Now held as credit for your next bill."]),
		...receiptFooter(input),
	].join("\n");
}

interface PaymentArrivedInput {
	senderName: string;
	amountCents: number;
	receivedAt: Date;
	reference: string;
	shared: boolean;
	suggestion: string[] | null;
	reviewUrl: string;
}

function arrivalHint(input: PaymentArrivedInput) {
	if (input.shared) return "Shared payment: choose how much belongs to each";
	if (input.suggestion?.length)
		return `Looks like ${input.suggestion.join(" + ")}`;
	return "No matching bill";
}

export function buildPaymentArrivedSummary(input: PaymentArrivedInput) {
	return [
		`*Payment arrived from ${input.senderName}*`,
		`${cents(input.amountCents)} on ${formatReceivedDate(input.receivedAt)} · ${
			input.reference ? `"${input.reference}"` : "no reference"
		}`,
		"",
		arrivalHint(input),
		`Review: ${input.reviewUrl}`,
	].join("\n");
}

interface OverdueDigestInput {
	firstName: string;
	items: Array<{ label: string; amountCents: number; daysOverdue: number }>;
	overdueCents: number;
	creditCents: number;
	payUrl: string;
}

const DIGEST_LINE_LIMIT = 8;

function overdueLine(item: OverdueDigestInput["items"][number]) {
	const days = `${item.daysOverdue} ${item.daysOverdue === 1 ? "day" : "days"}`;
	return `- ${item.label} · ${cents(item.amountCents)} · ${days} overdue`;
}

// The one private message a housemate gets each day while anything is
// overdue: what is late, by how much, and the link to pay it all.
export function buildOverdueDigestSummary(input: OverdueDigestInput) {
	const hidden = input.items.length - DIGEST_LINE_LIMIT;
	return [
		`*Hi ${input.firstName}, you have ${cents(input.overdueCents)} overdue*`,
		"",
		...input.items.slice(0, DIGEST_LINE_LIMIT).map(overdueLine),
		...(hidden > 0 ? [`+${hidden} more`] : []),
		"",
		...(input.creditCents > 0
			? [`${cents(input.creditCents)} of your credit is already applied.`]
			: []),
		input.payUrl,
	].join("\n");
}

export function buildOverdueDigestPreviewSummary(input: {
	date: string;
	digests: Array<{ housemateName: string; overdueCents: number }>;
}) {
	if (!input.digests.length)
		return `*No overdue digests would be sent on ${input.date}.*`;
	return [
		`*Overdue digests for ${input.date}*`,
		"",
		...input.digests.map(
			(digest) => `- ${digest.housemateName} · ${cents(digest.overdueCents)}`,
		),
		"",
		"Exact WhatsApp message(s) below:",
	].join("\n");
}
