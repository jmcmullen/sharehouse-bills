import { BillPdfStorageService } from "@/api/services/bill-pdf-storage";
import { PayNowDialog } from "@/components/public/pay-now-dialog";
import { PublicStatusBadge } from "@/components/public/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getPublicHousematePay } from "@/functions/public-housemate-pay";
import { buildOpenGraphMeta } from "@/lib/share-preview";
import { createFileRoute } from "@tanstack/react-router";
import confetti from "canvas-confetti";
import { ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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

function getFirstName(fullName: string) {
	const trimmed = fullName.trim();
	const first = trimmed.split(/\s+/)[0];
	return first || trimmed || "you";
}

function formatPayPageTitle(input: {
	housemateName: string;
	scope: {
		kind: "all" | "stack";
		stackGroup: string | null;
	};
	isAllSorted: boolean;
}) {
	const firstName = getFirstName(input.housemateName);

	if (input.isAllSorted) {
		if (input.scope.kind === "stack" && input.scope.stackGroup) {
			return `${firstName}'s ${formatStackGroupLabel(input.scope.stackGroup).toLowerCase()} are all sorted 🎉`;
		}
		return `${firstName} is all sorted 🎉`;
	}

	if (input.scope.kind === "stack" && input.scope.stackGroup) {
		return `Pay ${input.housemateName}'s ${formatStackGroupLabel(input.scope.stackGroup).toLowerCase()} bills`;
	}

	return `Pay ${input.housemateName}'s bills`;
}

function formatPayPageDescription(input: {
	remainingAmount: number;
	billCount: number;
	isAllSorted: boolean;
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
	return `${formatCurrency(input.remainingAmount)} across ${input.billCount} unpaid ${input.billCount === 1 ? "bill" : "bills"}.`;
}

const SECTION_LABEL_CLASS =
	"font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.12em]";

const CELEBRATION_COLORS = ["#c87553", "#4fb377", "#dda94a", "#f0bfa2"];

function firePopper(origin: { x: number; y: number }) {
	if (typeof window === "undefined") return;
	const prefersReducedMotion = window.matchMedia(
		"(prefers-reduced-motion: reduce)",
	).matches;
	if (prefersReducedMotion) return;

	const base = {
		particleCount: 55,
		startVelocity: 42,
		spread: 55,
		ticks: 200,
		colors: CELEBRATION_COLORS,
		scalar: 0.9,
		disableForReducedMotion: true,
	};
	confetti({ ...base, origin, angle: 65 });
	confetti({ ...base, origin, angle: 115 });
	window.setTimeout(() => {
		confetti({
			particleCount: 30,
			spread: 110,
			startVelocity: 22,
			origin,
			colors: CELEBRATION_COLORS,
			scalar: 0.7,
			ticks: 160,
			gravity: 0.9,
			disableForReducedMotion: true,
		});
	}, 240);
}

function getAnchorOrigin(element: HTMLElement | null) {
	if (typeof window === "undefined") return { x: 0.5, y: 0.35 };
	const rect = element?.getBoundingClientRect();
	if (!rect) return { x: 0.5, y: 0.35 };
	return {
		x: (rect.left + rect.width / 2) / window.innerWidth,
		y: (rect.top + rect.height / 2) / window.innerHeight,
	};
}

function useCelebration(active: boolean) {
	const anchorRef = useRef<HTMLButtonElement | null>(null);
	const firedRef = useRef(false);

	useEffect(() => {
		if (!active || firedRef.current) return;
		firedRef.current = true;
		firePopper(getAnchorOrigin(anchorRef.current));
	}, [active]);

	function replay() {
		firePopper(getAnchorOrigin(anchorRef.current));
	}

	return { anchorRef, replay };
}

function AllSortedPanel({
	housemateFirstName,
	recentlySettled,
}: {
	housemateFirstName: string;
	recentlySettled: {
		amount: number;
		billCount: number;
	};
}) {
	const { anchorRef, replay } = useCelebration(true);
	const hasRecap = recentlySettled.billCount > 0;
	const isStreak = recentlySettled.billCount >= 3;

	return (
		<section className="motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 flex flex-col gap-2 motion-safe:animate-in motion-safe:duration-500">
			<h2 className="font-semibold text-xl tracking-tight">
				Thanks, {housemateFirstName}{" "}
				<button
					ref={anchorRef}
					type="button"
					onClick={replay}
					aria-label="Celebrate again"
					className="motion-safe:hover:-rotate-12 inline-block cursor-pointer select-none rounded-sm border-0 bg-transparent p-0 align-middle ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-safe:transition-transform motion-safe:duration-300 motion-safe:active:scale-95"
				>
					🎉
				</button>
			</h2>
			{hasRecap ? (
				<p className="text-muted-foreground text-sm leading-6">
					You&apos;ve sorted{" "}
					<span className="font-semibold text-success tabular-nums">
						{formatCurrency(recentlySettled.amount)}
					</span>{" "}
					across {recentlySettled.billCount}{" "}
					{recentlySettled.billCount === 1 ? "bill" : "bills"} in the last 30
					days
					{isStreak ? " — absolute legend." : "."}
				</p>
			) : (
				<p className="text-muted-foreground text-sm leading-6">
					Your tab&apos;s empty.
				</p>
			)}
		</section>
	);
}

function LookingOutBanner({ onDismiss }: { onDismiss: () => void }) {
	return (
		<Alert className="motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:animate-in motion-safe:duration-500">
			<Loader2
				className="text-muted-foreground motion-safe:animate-spin"
				strokeWidth={2.5}
			/>
			<AlertTitle>Looking out for your payment</AlertTitle>
			<AlertDescription>
				<p>
					Usually sorts itself within a few minutes of the transfer landing.
				</p>
				<button
					type="button"
					onClick={onDismiss}
					className="rounded-sm text-left font-medium text-foreground underline underline-offset-4 ring-offset-background transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
				>
					Paid but not showing?
				</button>
			</AlertDescription>
		</Alert>
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

		const isAllSorted = loaderData.summary.billCount === 0;
		const title = formatPayPageTitle({
			housemateName: loaderData.housemate.name,
			scope: loaderData.scope,
			isAllSorted,
		});
		const description = formatPayPageDescription({
			remainingAmount: loaderData.paymentProgress.remainingAmount,
			billCount: loaderData.summary.billCount,
			isAllSorted,
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

	const {
		housemate,
		scope,
		items,
		paymentProgress,
		summary,
		payId,
		recentlySettled,
	} = loaderData;
	const isAllSorted = summary.billCount === 0;
	const stackGroupLabel =
		scope.kind === "stack" ? formatStackGroupLabel(scope.stackGroup) : null;
	const showProgress = !isAllSorted && paymentProgress.settledAmount > 0;
	const showLookingOut = !isAllSorted && hasInitiated;
	const housemateFirstName = getFirstName(housemate.name);
	const statusBadge = isAllSorted
		? {
				label: "Nothing due",
				tone: "success" as const,
			}
		: summary.overdueCount > 0
			? {
					label: `${summary.overdueCount} overdue, ${summary.billCount} unpaid`,
					tone: "danger" as const,
				}
			: {
					label: `${summary.billCount} unpaid`,
					tone: "warning" as const,
				};
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
						<PublicStatusBadge tone={statusBadge.tone}>
							{statusBadge.label}
						</PublicStatusBadge>
						{scope.kind === "stack" && stackGroupLabel ? (
							<PublicStatusBadge tone="neutral">
								{stackGroupLabel}
							</PublicStatusBadge>
						) : null}
					</div>
				</header>

				{isAllSorted ? (
					<AllSortedPanel
						housemateFirstName={housemateFirstName}
						recentlySettled={recentlySettled}
					/>
				) : null}

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

				{isAllSorted ? (
					scope.kind === "stack" && scope.allBillsPath ? (
						<div className="flex flex-col gap-2.5">
							<Button
								asChild
								variant="outline"
								className="h-11 w-full font-medium"
							>
								<a href={scope.allBillsPath}>View all bills</a>
							</Button>
						</div>
					) : null
				) : (
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
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
