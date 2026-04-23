import { BillPdfStorageService } from "@/api/services/bill-pdf-storage";
import { PayNowDialog } from "@/components/public/pay-now-dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getPublicHousematePay } from "@/functions/public-housemate-pay";
import { buildOpenGraphMeta } from "@/lib/share-preview";
import { createFileRoute } from "@tanstack/react-router";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

const INITIATED_TTL_MS = 30 * 60 * 1000;

function formatCurrency(amount: number) {
	return new Intl.NumberFormat("en-AU", {
		style: "currency",
		currency: "AUD",
	}).format(amount);
}

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

function startOfDay(date: Date) {
	const copy = new Date(date);
	copy.setHours(0, 0, 0, 0);
	return copy;
}

function formatDueUrgency(dateIso: string): {
	label: string;
	tone: "overdue" | "today" | "soon" | "later";
} {
	const today = startOfDay(new Date());
	const due = startOfDay(new Date(dateIso));
	const days = Math.round(
		(due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
	);

	if (days < 0) {
		const count = Math.abs(days);
		return {
			label: `Overdue by ${count} ${count === 1 ? "day" : "days"}`,
			tone: "overdue",
		};
	}
	if (days === 0) {
		return {
			label: "Due today",
			tone: "today",
		};
	}
	if (days === 1) {
		return {
			label: "Due tomorrow",
			tone: "soon",
		};
	}
	if (days <= 7) {
		return {
			label: `Due in ${days} days`,
			tone: "soon",
		};
	}

	return {
		label: `Due ${formatDate(dateIso)}`,
		tone: "later",
	};
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

function formatPayPageTitle(input: {
	housemateName: string;
	scope: {
		kind: "all" | "stack";
		stackGroup: string | null;
	};
}) {
	if (input.scope.kind === "stack" && input.scope.stackGroup) {
		return `Pay ${input.housemateName}'s ${formatStackGroupLabel(input.scope.stackGroup).toLowerCase()} bills`;
	}

	return `Pay ${input.housemateName}'s bills`;
}

function formatPayPageDescription(input: {
	remainingAmount: number;
	billCount: number;
}) {
	return `${formatCurrency(input.remainingAmount)} across ${input.billCount} unpaid ${input.billCount === 1 ? "bill" : "bills"}.`;
}

const SECTION_LABEL_CLASS =
	"font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.12em]";

function AllSortedBanner({ message }: { message: string }) {
	return (
		<div className="motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 relative overflow-hidden rounded-2xl bg-success-muted px-5 py-4 motion-safe:animate-in motion-safe:duration-500">
			<div className="flex items-center gap-3">
				<div
					aria-hidden
					className="motion-safe:zoom-in-50 flex h-9 w-9 items-center justify-center rounded-full bg-success text-success-foreground motion-safe:animate-in motion-safe:delay-150 motion-safe:duration-300"
				>
					<Check className="h-5 w-5" strokeWidth={3} />
				</div>
				<div className="flex-1">
					<p className="font-bold text-[15px] text-success-muted-foreground tracking-tight">
						All sorted 🎉
					</p>
					<p className="text-[12.5px] text-success-muted-foreground/80">
						{message}
					</p>
				</div>
			</div>
		</div>
	);
}

function LookingOutBanner({ onDismiss }: { onDismiss: () => void }) {
	return (
		<div className="motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/40 px-5 py-4 motion-safe:animate-in motion-safe:duration-400">
			<div
				aria-hidden
				className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground"
			>
				<Loader2
					className="h-4 w-4 motion-safe:animate-spin"
					strokeWidth={2.5}
				/>
			</div>
			<div className="flex-1 space-y-1.5">
				<p className="font-semibold text-[14px] tracking-tight">
					Looking out for your payment
				</p>
				<p className="text-[12.5px] text-muted-foreground leading-5">
					Usually sorts itself within a few minutes of the transfer landing.{" "}
					<button
						type="button"
						onClick={onDismiss}
						className="underline underline-offset-4 transition-colors hover:text-foreground"
					>
						Paid but not showing?
					</button>
				</p>
			</div>
		</div>
	);
}

function useInitiatedPayment(token: string) {
	const [hasInitiated, setHasInitiated] = useState(false);

	useEffect(() => {
		if (typeof window === "undefined") return;
		try {
			const raw = window.localStorage.getItem(`pay-initiated:${token}`);
			if (!raw) return;
			const initiatedAt = Number(raw);
			if (
				Number.isFinite(initiatedAt) &&
				Date.now() - initiatedAt < INITIATED_TTL_MS
			) {
				setHasInitiated(true);
			} else {
				window.localStorage.removeItem(`pay-initiated:${token}`);
			}
		} catch {}
	}, [token]);

	function markInitiated() {
		if (typeof window === "undefined") return;
		try {
			window.localStorage.setItem(`pay-initiated:${token}`, String(Date.now()));
		} catch {}
		setHasInitiated(true);
	}

	function clearInitiated() {
		if (typeof window === "undefined") return;
		try {
			window.localStorage.removeItem(`pay-initiated:${token}`);
		} catch {}
		setHasInitiated(false);
	}

	return { hasInitiated, markInitiated, clearInitiated };
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

		const title = formatPayPageTitle({
			housemateName: loaderData.housemate.name,
			scope: loaderData.scope,
		});
		const description = formatPayPageDescription({
			remainingAmount: loaderData.paymentProgress.remainingAmount,
			billCount: loaderData.summary.billCount,
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
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0 flex-1">
					<p className="truncate font-semibold text-[15px] leading-tight tracking-[-0.005em]">
						{primary}
					</p>
					{secondary ? (
						<p className="mt-1 text-[12.5px] text-muted-foreground leading-tight">
							{secondary}
						</p>
					) : null}
				</div>
				<div className="flex shrink-0 items-start pt-0.5">
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
				</div>
			</div>
		</li>
	);
}

function PublicPayPage() {
	const loaderData = Route.useLoaderData();
	const params = Route.useParams();
	const { hasInitiated, markInitiated, clearInitiated } = useInitiatedPayment(
		params.token,
	);

	if (!loaderData) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
				<div className="mx-auto flex max-w-sm flex-col items-center gap-5 text-center">
					<div
						aria-hidden
						className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted font-bold text-2xl text-muted-foreground"
					>
						?
					</div>
					<div className="space-y-2">
						<h1 className="font-bold text-2xl tracking-tight">
							Hmm, this payment page&apos;s gone walkabout
						</h1>
						<p className="text-[14px] text-muted-foreground leading-6">
							The link might be old, or there are no unpaid bills left. Ask
							whoever sent it for a fresh one.
						</p>
					</div>
					<Button asChild variant="outline" className="h-11 font-medium">
						<a href="/">Head home</a>
					</Button>
				</div>
			</div>
		);
	}

	const { housemate, scope, items, paymentProgress, summary, payId } =
		loaderData;
	const isAllSorted = summary.billCount === 0;
	const stackGroupLabel =
		scope.kind === "stack" ? formatStackGroupLabel(scope.stackGroup) : null;
	const allSortedMessage =
		scope.kind === "stack" && stackGroupLabel
			? `${housemate.name} has no unpaid ${stackGroupLabel.toLowerCase()} bills right now.`
			: `${housemate.name} has no unpaid bills right now.`;
	const showProgress = !isAllSorted && paymentProgress.settledAmount > 0;
	const showLookingOut = !isAllSorted && hasInitiated;
	const payVerb =
		scope.kind === "stack" && stackGroupLabel
			? `Pay ${stackGroupLabel.toLowerCase()}`
			: "Pay all bills";

	return (
		<div className="min-h-screen bg-background text-foreground">
			<div className="mx-auto flex max-w-md flex-col gap-7 px-5 pt-5 pb-6 sm:gap-8 sm:pt-8 sm:pb-12">
				<header className="flex flex-col gap-3">
					<p className="truncate font-semibold text-[15px] tracking-tight">
						{housemate.name}
					</p>
					<div className="flex flex-col gap-1">
						<p className={SECTION_LABEL_CLASS}>
							{isAllSorted ? "All sorted" : "You owe"}
						</p>
						<h1 className="font-bold text-[3.25rem] tabular-nums leading-[1.02] tracking-[-0.03em]">
							{formatCurrency(paymentProgress.remainingAmount)}
						</h1>
					</div>
					<div className="flex flex-wrap gap-2">
						<span
							className={
								summary.overdueCount > 0
									? "inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-1 font-semibold text-destructive text-xs tracking-tight dark:bg-destructive/20"
									: "inline-flex items-center rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground text-xs tracking-tight"
							}
						>
							{summary.overdueCount > 0
								? `${summary.overdueCount} overdue, ${summary.billCount} unpaid`
								: `${summary.billCount} unpaid`}
						</span>
						{scope.kind === "stack" && stackGroupLabel ? (
							<span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground text-xs tracking-tight">
								{stackGroupLabel}
							</span>
						) : null}
					</div>
				</header>

				{isAllSorted ? <AllSortedBanner message={allSortedMessage} /> : null}

				{showLookingOut ? (
					<LookingOutBanner onDismiss={clearInitiated} />
				) : null}

				{showProgress ? (
					<section className="space-y-2.5">
						<div className="flex items-baseline justify-between gap-3">
							<p className="font-medium text-muted-foreground text-sm">
								<span className="tabular-nums">
									{formatCurrency(paymentProgress.settledAmount)}
								</span>{" "}
								of{" "}
								<span className="tabular-nums">
									{formatCurrency(
										paymentProgress.settledAmount +
											paymentProgress.remainingAmount,
									)}
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
				) : null}

				{scope.kind === "all" ? (
					items.length > 0 ? (
						<section>
							<h2 className={`pb-3 ${SECTION_LABEL_CLASS}`}>Bills</h2>
							<ul className="divide-y divide-border/60">
								{items.map((item) => (
									<BillRow
										key={item.billId}
										primary={item.billerName || "Bill"}
										secondary={formatBillPeriod({
											billPeriodStartIso: item.billPeriodStartIso,
											billPeriodEndIso: item.billPeriodEndIso,
											dueDateIso: item.dueDateIso,
										})}
										amount={item.remainingAmount}
										billPath={item.billPath}
									/>
								))}
							</ul>
						</section>
					) : null
				) : (
					<section>
						<h2 className={`pb-3 ${SECTION_LABEL_CLASS}`}>{stackGroupLabel}</h2>
						<ul className="divide-y divide-border/60">
							{items.map((item) => {
								const period = formatBillPeriod({
									billPeriodStartIso: item.billPeriodStartIso,
									billPeriodEndIso: item.billPeriodEndIso,
									dueDateIso: item.dueDateIso,
								});
								const urgency = formatDueUrgency(item.dueDateIso).label;
								return (
									<BillRow
										key={item.billId}
										primary={item.billerName || "Bill"}
										secondary={`${period} · ${urgency}`}
										amount={item.remainingAmount}
										billPath={item.billPath}
									/>
								);
							})}
						</ul>
					</section>
				)}

				<div className="-mx-5 sticky bottom-0 z-20 bg-background px-5 pt-2 pb-2 sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:pt-0 sm:pb-0">
					<div className="flex flex-col gap-2.5">
						{scope.kind === "stack" && scope.allBillsPath ? (
							<Button
								asChild
								variant="outline"
								className="h-11 w-full font-medium"
							>
								<a href={scope.allBillsPath}>View all bills</a>
							</Button>
						) : null}
						{!isAllSorted ? (
							<PayNowDialog
								triggerLabel={payVerb}
								title={payVerb}
								payId={payId}
								amount={paymentProgress.remainingAmount}
								descriptionValue={
									scope.kind === "stack" && stackGroupLabel
										? stackGroupLabel
										: "Bills"
								}
								onInitiated={markInitiated}
							/>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
}
