import { BillPdfStorageService } from "@/api/services/bill-pdf-storage";
import { PayNowDialog } from "@/components/public/pay-now-dialog";
import { PublicStatusBadge } from "@/components/public/status-badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getPublicBillByPdfSha } from "@/functions/public-bill";
import { buildOpenGraphMeta, formatCurrency } from "@/lib/share-preview";
import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";

function formatDate(dateIso: string) {
	return new Intl.DateTimeFormat("en-AU", {
		weekday: "short",
		day: "numeric",
		month: "short",
	}).format(new Date(dateIso));
}

function formatBillPageTitle(input: {
	billerName: string;
	totalAmount: number;
	isAllSorted: boolean;
}) {
	if (input.isAllSorted) {
		return `${input.billerName} paid in full`;
	}

	return `Bill from ${input.billerName} for ${formatCurrency(input.totalAmount)}`;
}

function formatBillPageDescription(input: {
	dueDateIso: string;
	hasEvenShares: boolean;
	amountEach: number | null;
	participantCount: number;
	isAllSorted: boolean;
}) {
	if (input.isAllSorted) {
		return "Thanks everyone for settling up.";
	}

	const dueLabel = formatDate(input.dueDateIso);
	return input.hasEvenShares && input.amountEach !== null
		? `Due ${dueLabel}. ${formatCurrency(input.amountEach)} each.`
		: `Due ${dueLabel}. Split across ${input.participantCount} ${input.participantCount === 1 ? "housemate" : "housemates"}.`;
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
		const n = Math.abs(days);
		return {
			label: `Overdue by ${n} ${n === 1 ? "day" : "days"}`,
			tone: "overdue",
		};
	}
	if (days === 0) return { label: "Due today", tone: "today" };
	if (days === 1) return { label: "Due tomorrow", tone: "soon" };
	if (days <= 7) return { label: `Due in ${days} days`, tone: "soon" };
	return { label: `Due ${formatDate(dateIso)}`, tone: "later" };
}

function getInitials(name: string) {
	const trimmed = name.trim();
	if (!trimmed) return "?";
	const parts = trimmed.split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	if (parts.length === 1) {
		// Use first two code points to survive emoji / combining chars.
		const chars = Array.from(parts[0]);
		return chars.slice(0, 2).join("").toUpperCase();
	}
	const first = Array.from(parts[0])[0] ?? "";
	const last = Array.from(parts[parts.length - 1])[0] ?? "";
	return (first + last).toUpperCase();
}

function AllSortedBanner() {
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
						Everyone's paid up on this one.
					</p>
				</div>
			</div>
		</div>
	);
}

export const Route = createFileRoute("/bill/$pdfSha256")({
	loader: async ({ params, location }) =>
		await getPublicBillByPdfSha({
			data: {
				pdfSha256: params.pdfSha256,
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
					{ title: "This link has expired" },
					{ name: "robots", content: "noindex, nofollow" },
					{
						name: "description",
						content: "This shared bill link is no longer available.",
					},
					{ property: "og:title", content: "Link expired" },
					{
						property: "og:description",
						content: "This shared bill link is no longer available.",
					},
					{ property: "og:type", content: "website" },
				],
			};
		}

		const isAllSorted = loaderData.paymentProgress.percentage === 100;
		const title = formatBillPageTitle({
			billerName: loaderData.bill.billerName,
			totalAmount: loaderData.bill.totalAmount,
			isAllSorted,
		});
		const description = formatBillPageDescription({
			dueDateIso: loaderData.bill.dueDateIso,
			hasEvenShares: loaderData.shareSummary.hasEvenShares,
			amountEach: loaderData.shareSummary.amountEach,
			participantCount: loaderData.shareSummary.participantCount,
			isAllSorted,
		});
		const previewDate = loaderData.previewDate;
		const sharePageUrl = BillPdfStorageService.getAbsoluteViewerUrl(
			loaderData.bill.id,
			previewDate,
		);
		const shareOgImageUrl = BillPdfStorageService.getAbsoluteAppUrl(
			BillPdfStorageService.getOgImageUrl(loaderData.bill.id, previewDate),
		);

		return {
			meta: [
				{ title },
				{ name: "robots", content: "noindex, nofollow" },
				{ name: "description", content: description },
				...buildOpenGraphMeta({
					title,
					description,
					url: sharePageUrl,
					imageUrl: shareOgImageUrl,
				}),
			],
			links: loaderData.links.pageUrl
				? [{ rel: "canonical", href: loaderData.links.pageUrl }]
				: [],
		};
	},

	component: PublicBillPage,
});

function PublicBillPage() {
	const loaderData = Route.useLoaderData();

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
							Hmm, this bill's gone walkabout
						</h1>
						<p className="text-[14px] text-muted-foreground leading-6">
							The link might be old, or the bill has been removed. Ask whoever
							sent it for a fresh one.
						</p>
					</div>
					<Button asChild variant="outline" className="h-11 font-medium">
						<a href="/">Head home</a>
					</Button>
				</div>
			</div>
		);
	}

	const { bill, shareSummary, paymentProgress, participants, links, payId } =
		loaderData;
	const urgency = formatDueUrgency(bill.dueDateIso);
	const isAllSorted = paymentProgress.percentage === 100;
	const statusBadge = isAllSorted
		? {
				label: "Paid in full",
				tone: "success" as const,
			}
		: urgency.tone === "overdue"
			? {
					label: urgency.label,
					tone: "danger" as const,
				}
			: urgency.tone === "today"
				? {
						label: urgency.label,
						tone: "warning" as const,
					}
				: urgency.tone === "soon"
					? {
							label: urgency.label,
							tone: "info" as const,
						}
					: {
							label: urgency.label,
							tone: "neutral" as const,
						};
	const payNowAmount =
		shareSummary.amountEach ??
		participants.find((participant) => !participant.isOwner)?.amountOwed ??
		paymentProgress.remainingAmount;
	const hasFooterActions = bill.hasPdf || !isAllSorted;

	return (
		<div className="min-h-screen bg-background text-foreground">
			<div
				className={`mx-auto flex min-h-screen max-w-md flex-col gap-7 px-5 pt-5 ${hasFooterActions ? "pb-32 sm:pb-12" : "pb-6 sm:pb-12"} sm:min-h-0 sm:gap-8 sm:pt-8`}
			>
				{/* Hero */}
				<header className="flex flex-col gap-3">
					<p className="truncate font-semibold text-[15px] tracking-tight">
						{bill.billerName || "Untitled bill"}
					</p>
					<h1 className="font-bold text-[3.25rem] tabular-nums leading-[1.02] tracking-[-0.03em]">
						{formatCurrency(bill.totalAmount)}
					</h1>
					<div>
						<PublicStatusBadge tone={statusBadge.tone}>
							{statusBadge.label}
						</PublicStatusBadge>
					</div>
				</header>

				{/* Progress (secondary) → celebration at 100% */}
				{isAllSorted ? (
					<AllSortedBanner />
				) : (
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
								paid
							</p>
							<p className="font-semibold text-foreground text-sm tabular-nums">
								{paymentProgress.percentage}%
							</p>
						</div>
						<Progress
							value={paymentProgress.percentage}
							aria-label="Household payment progress"
							className="h-2 bg-muted"
						/>
					</section>
				)}

				<section>
					<h2 className="pb-3 font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.12em]">
						Housemates
					</h2>
					{participants.length === 0 ? (
						<p className="rounded-xl bg-muted/60 px-4 py-3 text-[13px] text-muted-foreground leading-6">
							This bill isn't split yet — check back once shares are set up.
						</p>
					) : (
						<ul className="divide-y divide-border/60">
							{participants.map((p) => (
								<li key={p.id} className="flex items-center gap-3.5 py-3.5">
									<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-[13px] text-muted-foreground tracking-tight">
										{getInitials(p.name)}
									</div>
									<div className="min-w-0 flex-1">
										<p className="truncate font-semibold text-[15px] leading-tight tracking-[-0.005em]">
											{p.name || "Housemate"}
										</p>
										<p className="mt-1 text-[12.5px] text-muted-foreground leading-none">
											{p.isOwner ? (
												"Paid the bill"
											) : (
												<span className="tabular-nums">
													{formatCurrency(p.amountOwed)} share
												</span>
											)}
										</p>
									</div>
									{p.isPaid ? (
										<span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-muted px-2.5 py-1 font-semibold text-[11.5px] text-success-muted-foreground tracking-tight">
											<span
												aria-hidden
												className="h-1.5 w-1.5 rounded-full bg-success"
											/>
											Paid
										</span>
									) : (
										<span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2.5 py-1 font-semibold text-[11.5px] text-muted-foreground tracking-tight">
											Due
										</span>
									)}
								</li>
							))}
						</ul>
					)}
				</section>

				{/* Actions */}
				<div className="fixed inset-x-0 bottom-0 z-20 bg-background/95 px-5 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:static sm:z-auto sm:mt-auto sm:bg-transparent sm:px-0 sm:pt-0 sm:pb-0 sm:backdrop-blur-none">
					<div className="mx-auto flex w-full max-w-md flex-col gap-2.5">
						{bill.hasPdf ? (
							<Button
								asChild
								variant="outline"
								className="h-11 w-full font-medium"
							>
								<a href={links.pdfPath} target="_blank" rel="noreferrer">
									View invoice PDF
								</a>
							</Button>
						) : null}
						{!isAllSorted ? (
							<PayNowDialog
								triggerLabel="Pay now"
								title="Pay this bill"
								payId={payId}
								amount={payNowAmount}
								descriptionValue="Bills"
							/>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
}
