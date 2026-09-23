import { formatReminderBillLabel } from "../../lib/reminder-preview";

function formatCurrency(amount: number) {
	return new Intl.NumberFormat("en-AU", {
		style: "currency",
		currency: "AUD",
	}).format(amount);
}

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

function formatReminderDate(date: Date) {
	return new Intl.DateTimeFormat("en-AU", {
		weekday: "short",
		day: "numeric",
		month: "short",
	}).format(date);
}

interface ReminderCredit {
	creditCents: number;
	receivedAt: Date | null;
	toPayCents: number;
}

// Names the money already received so the reminder never asks for it twice.
export function buildCreditLine(input: ReminderCredit) {
	const from = input.receivedAt
		? ` from your ${formatDayMonth(input.receivedAt)} payment`
		: "";
	return input.toPayCents > 0
		? `${cents(input.creditCents)} credit${from} is applied, ${cents(input.toPayCents)} to pay`
		: `${cents(input.creditCents)} credit${from} covers this, nothing to pay`;
}

export function buildBillReminderSummary(input: {
	payUrl: string;
	credit: ReminderCredit | null;
}) {
	return input.credit && input.credit.creditCents > 0
		? [buildCreditLine(input.credit), input.payUrl].join("\n")
		: input.payUrl;
}

export function buildBillReminderPreviewSummary(input: {
	asOf: Date;
	housemateName: string;
	reminders: Array<{
		kind: "pre_due" | "overdue";
		debt: {
			billerName: string;
			recurringTemplateName?: string | null;
			dueDate: Date;
		};
	}>;
}) {
	const lines = [
		`*Random reminder preview for ${input.housemateName}*`,
		`Cron date: ${new Intl.DateTimeFormat("en-AU", {
			weekday: "long",
			day: "numeric",
			month: "short",
			year: "numeric",
		}).format(input.asOf)}`,
		"",
		`${input.housemateName} would receive ${input.reminders.length} ${input.reminders.length === 1 ? "message" : "messages"}:`,
	];

	lines.push(
		...input.reminders.map((reminder, index) => {
			const label = reminder.kind === "pre_due" ? "pre-due" : "overdue";
			return `${index + 1}. ${label}: ${formatReminderBillLabel({
				billerName: reminder.debt.billerName,
				recurringTemplateName: reminder.debt.recurringTemplateName,
			})} due ${formatReminderDate(reminder.debt.dueDate)}`;
		}),
	);

	lines.push("", "Exact WhatsApp message(s) below:");

	return lines.join("\n");
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

function formatDayMonth(date: Date) {
	return new Intl.DateTimeFormat("en-AU", {
		day: "numeric",
		month: "short",
	}).format(date);
}

function receiptLines(lines: ReceiptLine[]) {
	return lines.map(
		(line) =>
			`- ${line.billName}${line.dueDate ? ` (due ${formatDayMonth(line.dueDate)})` : ""} · ${cents(line.amountCents)}`,
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
		`${cents(input.amountCents)} on ${formatReminderDate(input.receivedAt)}`,
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
		...receiptLines(input.covered),
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
		`${cents(input.amountCents)} on ${formatReminderDate(input.receivedAt)}`,
		"",
		...(input.before.length
			? ["Previously covered:", ...receiptLines(input.before)]
			: ["Previously held as credit."]),
		"",
		...(input.after.length
			? [
					"Now covers:",
					...receiptLines(input.after),
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
		`${cents(input.amountCents)} on ${formatReminderDate(input.receivedAt)} · ${
			input.reference ? `"${input.reference}"` : "no reference"
		}`,
		"",
		arrivalHint(input),
		`Review: ${input.reviewUrl}`,
	].join("\n");
}
