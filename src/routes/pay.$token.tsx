// fallow-ignore-file code-duplication
import { BillPdfStorageService } from "@/api/services/bill-pdf-storage";
import type { PublicHousematePayPageData } from "@/api/services/housemate-pay-page.server";
import { isOwing } from "@/api/services/housemate-pay-summary";
import { AllSortedPanel } from "@/components/public/all-sorted-panel";
import {
	AmountHeader,
	ExpiredLinkPage,
	PublicPage,
} from "@/components/public/page-shell";
import {
	CoveredBillsSection,
	CreditNote,
	formatBillCount,
} from "@/components/public/pay-credit";
import { PayFooterActions } from "@/components/public/pay-footer";
import { RowContent } from "@/components/public/row-content";
import { SectionHeader } from "@/components/public/section-header";
import { PublicStatusBadge } from "@/components/public/status-badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getPublicHousematePay } from "@/functions/public-housemate-pay";
import {
	formatReminderBillLabel,
	formatReminderMetaDescription,
} from "@/lib/reminder-preview";
import {
	buildOpenGraphMeta,
	formatCurrency,
	getBillDueStatus,
} from "@/lib/share-preview";
import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";

function formatDate(dateIso: string) {
	return new Intl.DateTimeFormat("en-AU", {
		weekday: "short",
		day: "numeric",
		month: "short",
	}).format(new Date(dateIso));
}

function formatCompactDate(dateIso: string) {
	return new Intl.DateTimeFormat("en-AU", {
		day: "numeric",
		month: "short",
	}).format(new Date(dateIso));
}

function formatBillPeriod(input: {
	billPeriodStartIso: string | null;
	billPeriodEndIso: string | null;
	dueDateIso: string;
}) {
	if (input.billPeriodStartIso && input.billPeriodEndIso) {
		return `${formatCompactDate(input.billPeriodStartIso)} to ${formatCompactDate(input.billPeriodEndIso)}`;
	}

	if (input.billPeriodStartIso) {
		return `From ${formatCompactDate(input.billPeriodStartIso)}`;
	}

	if (input.billPeriodEndIso) {
		return `Until ${formatCompactDate(input.billPeriodEndIso)}`;
	}

	return `Due ${formatDate(input.dueDateIso)}`;
}

function formatStackGroupLabel(stackGroup: string) {
	return stackGroup
		.split(/[\s_-]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function getFirstName(fullName: string) {
	const trimmed = fullName.trim();
	const first = trimmed.split(/\s+/)[0];
	return first || trimmed || "you";
}

function formatPayPageTitle(input: {
	housemateName: string;
	scope: {
		kind: "all" | "stack" | "bills";
		stackGroup: string | null;
	};
	isAllSorted: boolean;
	reminderBill: {
		billerName: string;
		recurringTemplateName: string | null;
	} | null;
}) {
	const firstName = getFirstName(input.housemateName);

	if (input.isAllSorted) {
		if (input.scope.kind === "stack" && input.scope.stackGroup) {
			return `${firstName}'s ${formatStackGroupLabel(input.scope.stackGroup).toLowerCase()} are all sorted 🎉`;
		}
		if (input.scope.kind === "bills") {
			return `${firstName}'s reminder bills are all sorted 🎉`;
		}
		return `${firstName} is all sorted 🎉`;
	}

	if (input.reminderBill) {
		return `Reminder to pay ${formatReminderBillLabel(input.reminderBill)}`;
	}

	if (input.scope.kind === "stack" && input.scope.stackGroup) {
		return `Pay ${input.housemateName}'s ${formatStackGroupLabel(input.scope.stackGroup).toLowerCase()} bills`;
	}

	if (input.scope.kind === "bills") {
		return `Pay ${input.housemateName}'s reminder bills`;
	}

	return `Pay ${input.housemateName}'s bills`;
}

function formatPayPageDescription(input: {
	remainingAmount: number;
	billCount: number;
	isAllSorted: boolean;
	reminderBill: {
		billerName: string;
		recurringTemplateName: string | null;
		dueDateIso: string;
		isOverdue: boolean;
	} | null;
	recentlySettled: {
		amount: number;
		billCount: number;
	};
}) {
	if (input.isAllSorted) {
		if (input.recentlySettled.billCount > 0) {
			return `Nothing to pay right now — ${formatCurrency(input.recentlySettled.amount)} sorted across ${input.recentlySettled.billCount} ${input.recentlySettled.billCount === 1 ? "bill" : "bills"} recently. Thanks!`;
		}
		return "Nothing to pay right now. Thanks for staying on top of it.";
	}
	if (input.reminderBill) {
		return formatReminderMetaDescription({
			billerName: input.reminderBill.billerName,
			recurringTemplateName: input.reminderBill.recurringTemplateName,
			dueDate: input.reminderBill.dueDateIso,
			remainingAmount: input.remainingAmount,
			isOverdue: input.reminderBill.isOverdue,
		});
	}
	return `${formatCurrency(input.remainingAmount)} across ${input.billCount} unpaid ${input.billCount === 1 ? "bill" : "bills"}.`;
}

export const Route = createFileRoute("/pay/$token")({
	loader: async ({ params, location }) =>
		await getPublicHousematePay({
			data: {
				token: params.token,
				previewDate:
					BillPdfStorageService.normalizeMessageCacheDate(
						new URLSearchParams(location.search).get("d"),
					) ?? undefined,
			},
		}),

	head: ({ loaderData }) => {
		if (!loaderData) {
			return {
				meta: [
					{
						title: "This link has expired",
					},
					{
						name: "robots",
						content: "noindex, nofollow",
					},
					{
						name: "description",
						content: "This payment link is no longer available.",
					},
					{
						property: "og:title",
						content: "This link has expired",
					},
					{
						property: "og:description",
						content: "This payment link is no longer available.",
					},
					{
						property: "og:type",
						content: "website",
					},
				],
			};
		}

		const isAllSorted = loaderData.summary.billCount === 0;
		const reminderBill =
			!isAllSorted &&
			loaderData.scope.kind === "bills" &&
			loaderData.items.length === 1
				? loaderData.items[0]
				: null;
		const title = formatPayPageTitle({
			housemateName: loaderData.housemate.name,
			scope: loaderData.scope,
			isAllSorted,
			reminderBill: reminderBill
				? {
						billerName: reminderBill.billerName,
						recurringTemplateName: reminderBill.recurringTemplateName,
					}
				: null,
		});
		const description = formatPayPageDescription({
			remainingAmount: loaderData.summary.remainingAmount,
			billCount: loaderData.summary.billCount,
			isAllSorted,
			reminderBill: reminderBill
				? {
						billerName: reminderBill.billerName,
						recurringTemplateName: reminderBill.recurringTemplateName,
						dueDateIso: reminderBill.dueDateIso,
						isOverdue: reminderBill.isOverdue,
					}
				: null,
			recentlySettled: loaderData.recentlySettled,
		});
		const previewDate = loaderData.previewDate;
		const token = loaderData.links.pagePath.split("/").pop() ?? "";
		const sharePageUrl = BillPdfStorageService.getAbsoluteHousematePayUrl(
			token,
			previewDate,
		);
		const shareOgImageUrl = BillPdfStorageService.getAbsoluteAppUrl(
			BillPdfStorageService.getPayOgImageUrl(token, previewDate),
		);

		return {
			meta: [
				{
					title,
				},
				{
					name: "robots",
					content: "noindex, nofollow",
				},
				{
					name: "description",
					content: description,
				},
				...buildOpenGraphMeta({
					title,
					description,
					url: sharePageUrl,
					imageUrl: shareOgImageUrl,
				}),
			],
			links: loaderData.links.pageUrl
				? [
						{
							rel: "canonical",
							href: loaderData.links.pageUrl,
						},
					]
				: [],
		};
	},

	component: PublicPayPage,
});

function BillRow({
	primary,
	secondary,
	amount,
	billPath,
}: {
	primary: string;
	secondary?: string | null;
	amount: number;
	billPath: string;
}) {
	return (
		<li className="py-3.5">
			<RowContent
				primary={primary}
				secondary={secondary}
				aside={
					<Button
						asChild
						variant="outline"
						size="sm"
						className="h-8 gap-1.5 px-2.5 font-medium"
					>
						<a href={billPath}>
							<ExternalLink className="h-3.5 w-3.5" />
							<span>{`${formatCurrency(amount)} bill`}</span>
						</a>
					</Button>
				}
			/>
		</li>
	);
}

type PayPageItem = Omit<
	PublicHousematePayPageData["items"][number],
	"billPeriodEnd" | "billPeriodStart" | "dueDate"
> & {
	billPeriodEndIso: string | null;
	billPeriodStartIso: string | null;
	dueDateIso: string;
};

type PayPageData = Omit<
	PublicHousematePayPageData,
	"items" | "nonUtilityItems" | "utilityGroups"
> & {
	items: PayPageItem[];
	nonUtilityItems: PayPageItem[];
	payId: string | null;
	previewDate: string | null;
	utilityGroups: Array<{
		label: string;
		items: PayPageItem[];
	}>;
};

function getItemsTotal(items: PayPageItem[]) {
	return items.reduce((total, item) => total + item.remainingAfterCredit, 0);
}

function getSingleReminderItem(data: PayPageData) {
	return data.summary.billCount > 0 &&
		data.scope.kind === "bills" &&
		data.items.length === 1
		? data.items[0]
		: null;
}

function getPayStatusBadge(input: {
	isAllSorted: boolean;
	isAllCovered: boolean;
	singleReminderItem: PayPageItem | null;
	summary: PayPageData["summary"];
}) {
	if (input.isAllSorted) {
		return { label: "Nothing due", tone: "success" as const };
	}

	if (input.isAllCovered) {
		return { label: "Nothing to pay", tone: "success" as const };
	}

	if (input.singleReminderItem) {
		return {
			label: input.singleReminderItem.isOverdue
				? "Overdue reminder"
				: "Reminder",
			tone: input.singleReminderItem.isOverdue
				? ("danger" as const)
				: ("warning" as const),
		};
	}

	if (input.summary.overdueCount > 0) {
		return {
			label: `${input.summary.overdueCount} overdue, ${input.summary.billCount} unpaid`,
			tone: "danger" as const,
		};
	}

	return {
		label: `${input.summary.billCount} unpaid`,
		tone: "warning" as const,
	};
}

function getPayVerb(input: {
	scope: PayPageData["scope"];
	stackGroupLabel: string | null;
	billCount: number;
}) {
	if (input.scope.kind === "stack" && input.stackGroupLabel) {
		return `Pay ${input.stackGroupLabel.toLowerCase()}`;
	}

	if (input.scope.kind === "bills") {
		return input.billCount === 1 ? "Pay this bill" : "Pay these bills";
	}

	return "Pay all bills";
}

function getPayHeadline(input: {
	isAllSorted: boolean;
	isAllCovered: boolean;
}) {
	if (input.isAllSorted) return "All sorted";
	if (input.isAllCovered) return "All covered";
	return "You owe";
}

function PayHeader({
	data,
	isAllSorted,
	isAllCovered,
	stackGroupLabel,
	singleReminderItem,
}: {
	data: PayPageData;
	isAllSorted: boolean;
	isAllCovered: boolean;
	stackGroupLabel: string | null;
	singleReminderItem: PayPageItem | null;
}) {
	const statusBadge = getPayStatusBadge({
		isAllSorted,
		isAllCovered,
		singleReminderItem,
		summary: data.summary,
	});

	return (
		<AmountHeader
			name={data.housemate.name}
			label={getPayHeadline({ isAllSorted, isAllCovered })}
			amount={formatCurrency(data.summary.remainingAmount)}
		>
			<PublicStatusBadge tone={statusBadge.tone}>
				{statusBadge.label}
			</PublicStatusBadge>
			{stackGroupLabel ? (
				<PublicStatusBadge tone="neutral">{stackGroupLabel}</PublicStatusBadge>
			) : data.scope.kind === "bills" && !singleReminderItem ? (
				<PublicStatusBadge tone="neutral">Reminder</PublicStatusBadge>
			) : null}
		</AmountHeader>
	);
}

function PaymentProgressSection({
	paymentProgress,
	remainingAmount,
}: {
	paymentProgress: PayPageData["paymentProgress"];
	remainingAmount: number;
}) {
	return (
		<section className="space-y-2.5">
			<div className="flex items-baseline justify-between gap-3">
				<p className="font-medium text-muted-foreground text-sm">
					<span className="tabular-nums">
						{formatCurrency(paymentProgress.settledAmount)}
					</span>{" "}
					of{" "}
					<span className="tabular-nums">
						{formatCurrency(paymentProgress.settledAmount + remainingAmount)}
					</span>{" "}
					sorted
				</p>
				<p className="font-semibold text-foreground text-sm tabular-nums">
					{paymentProgress.percentage}%
				</p>
			</div>
			<Progress
				value={paymentProgress.percentage}
				aria-label="Payment progress"
				className="h-2 bg-muted"
			/>
		</section>
	);
}

function getPayBillSecondaryText(item: PayPageItem) {
	const period = formatBillPeriod({
		billPeriodStartIso: item.billPeriodStartIso,
		billPeriodEndIso: item.billPeriodEndIso,
		dueDateIso: item.dueDateIso,
	});
	const urgency = getBillDueStatus(item.dueDateIso).label;
	const base =
		period === `Due ${formatDate(item.dueDateIso)}`
			? urgency
			: `${period} · ${urgency}`;

	return item.coveredAmount > 0.009
		? `${base} · ${formatCurrency(item.remainingAfterCredit)} left after credit`
		: base;
}

function toCoveredBill(item: PayPageItem) {
	return {
		billId: item.billId,
		billerName: item.billerName || "Bill",
		billPath: item.billPath,
		amount: item.remainingAmount,
		secondary: formatBillPeriod({
			billPeriodStartIso: item.billPeriodStartIso,
			billPeriodEndIso: item.billPeriodEndIso,
			dueDateIso: item.dueDateIso,
		}),
	};
}

function getDueNowGroupLabel(items: PayPageItem[]) {
	const hasOverdue = items.some(
		(item) => getBillDueStatus(item.dueDateIso).daysUntilDue < 0,
	);
	const hasDueToday = items.some(
		(item) => getBillDueStatus(item.dueDateIso).daysUntilDue === 0,
	);

	if (hasOverdue && hasDueToday) {
		return "Overdue and due today";
	}

	return hasOverdue ? "Overdue" : "Due today";
}

function getBillListGroups(items: PayPageItem[]) {
	const dueNowItems = items.filter(
		(item) => getBillDueStatus(item.dueDateIso).daysUntilDue <= 0,
	);
	const upcomingItems = items.filter(
		(item) => getBillDueStatus(item.dueDateIso).daysUntilDue > 0,
	);

	return [
		dueNowItems.length > 0
			? {
					key: "due-now",
					label: getDueNowGroupLabel(dueNowItems),
					items: dueNowItems,
				}
			: null,
		upcomingItems.length > 0
			? {
					key: "upcoming",
					label: "Not yet due",
					items: upcomingItems,
				}
			: null,
	].filter((group) => group !== null);
}

function PayBillListSection({
	items,
}: {
	items: PayPageData["items"];
}) {
	if (items.length === 0) {
		return null;
	}

	return (
		<section className="space-y-6">
			{getBillListGroups(items).map((group) => (
				<section key={group.key}>
					<SectionHeader
						label={group.label}
						aside={`${formatCurrency(getItemsTotal(group.items))} · ${formatBillCount(group.items.length)}`}
					/>
					<ul className="divide-y divide-border/60">
						{group.items.map((item) => (
							<BillRow
								key={item.billId}
								primary={item.billerName || "Bill"}
								secondary={getPayBillSecondaryText(item)}
								amount={item.remainingAfterCredit}
								billPath={item.billPath}
							/>
						))}
					</ul>
				</section>
			))}
		</section>
	);
}

function PublicPayPage() {
	const loaderData = Route.useLoaderData();
	const { token } = Route.useParams();

	if (!loaderData) {
		return (
			<ExpiredLinkPage
				title="Hmm, this payment page's gone walkabout"
				body="The link might be old, or there are no unpaid bills left. Ask whoever sent it for a fresh one."
			/>
		);
	}

	const isAllSorted = loaderData.items.length === 0;
	const isAllCovered = !isAllSorted && loaderData.summary.billCount === 0;
	const nothingToPay = isAllSorted || isAllCovered;
	const owingItems = loaderData.items.filter(isOwing);
	const coveredBills = loaderData.items
		.filter((item) => !isOwing(item))
		.map(toCoveredBill);
	const stackGroupLabel =
		loaderData.scope.kind === "stack"
			? formatStackGroupLabel(loaderData.scope.stackGroup)
			: null;
	const singleReminderItem = getSingleReminderItem(loaderData);
	const payVerb = getPayVerb({
		scope: loaderData.scope,
		stackGroupLabel,
		billCount: loaderData.summary.billCount,
	});

	return (
		<PublicPage hasFooter>
			<PayHeader
				data={loaderData}
				isAllSorted={isAllSorted}
				isAllCovered={isAllCovered}
				stackGroupLabel={stackGroupLabel}
				singleReminderItem={singleReminderItem}
			/>

			{isAllSorted ? (
				<AllSortedPanel
					housemateFirstName={getFirstName(loaderData.housemate.name)}
					recentlySettled={loaderData.recentlySettled}
				/>
			) : null}

			{isAllSorted ? null : <CreditNote credit={loaderData.credit} />}

			{!nothingToPay && loaderData.paymentProgress.settledAmount > 0 ? (
				<PaymentProgressSection
					paymentProgress={loaderData.paymentProgress}
					remainingAmount={loaderData.summary.remainingAmount}
				/>
			) : null}

			<PayBillListSection items={owingItems} />

			<CoveredBillsSection items={coveredBills} />

			<PayFooterActions
				statementPath={`/pay/${token}/statement`}
				allBillsPath={
					loaderData.scope.kind === "all" ? null : loaderData.scope.allBillsPath
				}
				nothingToPay={nothingToPay}
				payVerb={payVerb}
				payId={loaderData.payId}
				remainingAmount={loaderData.summary.remainingAmount}
				overdueAmount={loaderData.summary.overdueAmount}
			/>
		</PublicPage>
	);
}
