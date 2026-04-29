// fallow-ignore-file code-duplication
import { BillPdfStorageService } from "@/api/services/bill-pdf-storage";
import type { PublicBillPageData as PublicBillPageServerData } from "@/api/services/public-bill-page.server";
import { PayNowDialog } from "@/components/public/pay-now-dialog";
import { PublicStatusBadge } from "@/components/public/status-badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getPublicBillByPdfSha } from "@/functions/public-bill";
import {
	type BillDueStatus,
	buildOpenGraphMeta,
	formatBillPageDescription,
	formatBillPageTitle,
	formatCurrency,
	getBillDueStatus,
} from "@/lib/share-preview";
import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";

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
		const dueStatus = getBillDueStatus(loaderData.bill.dueDateIso);
		const title = formatBillPageTitle({
			billerName: loaderData.bill.billerName,
			totalAmount: loaderData.bill.totalAmount,
			isAllSorted,
			dueStatus,
		});
		const description = formatBillPageDescription({
			hasEvenShares: loaderData.shareSummary.hasEvenShares,
			amountEach: loaderData.shareSummary.amountEach,
			participantCount: loaderData.shareSummary.participantCount,
			isAllSorted,
			dueStatus,
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

type PublicBillPageData = Omit<PublicBillPageServerData, "bill"> & {
	bill: Omit<
		PublicBillPageServerData["bill"],
		"billPeriodEnd" | "billPeriodStart" | "dueDate"
	> & {
		billPeriodEndIso: string | null;
		billPeriodStartIso: string | null;
		dueDateIso: string;
	};
	payId: string | null;
	previewDate: string | null;
};
type PublicBillParticipant = PublicBillPageData["participants"][number];

function ExpiredBillPage() {
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

function getBillStatusBadge(input: {
	isAllSorted: boolean;
	urgency: BillDueStatus;
}): {
	label: string;
	tone: "danger" | "info" | "neutral" | "success" | "warning";
} {
	if (input.isAllSorted) {
		return {
			label: "Paid in full",
			tone: "success",
		};
	}

	if (input.urgency.tone === "overdue") {
		return {
			label: input.urgency.label,
			tone: "danger",
		};
	}

	if (input.urgency.tone === "today") {
		return {
			label: input.urgency.label,
			tone: "warning",
		};
	}

	return {
		label: input.urgency.label,
		tone: input.urgency.tone === "soon" ? "info" : "neutral",
	};
}

function getPayNowAmount(data: PublicBillPageData) {
	return (
		data.shareSummary.amountEach ??
		data.participants.find((participant) => !participant.isOwner)?.amountOwed ??
		data.paymentProgress.remainingAmount
	);
}

function BillHero({
	bill,
	statusBadge,
}: {
	bill: PublicBillPageData["bill"];
	statusBadge: ReturnType<typeof getBillStatusBadge>;
}) {
	return (
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
	);
}

function BillProgressSection({
	isAllSorted,
	paymentProgress,
}: {
	isAllSorted: boolean;
	paymentProgress: PublicBillPageData["paymentProgress"];
}) {
	if (isAllSorted) {
		return <AllSortedBanner />;
	}

	return (
		<section className="space-y-2.5">
			<div className="flex items-baseline justify-between gap-3">
				<p className="font-medium text-muted-foreground text-sm">
					<span className="tabular-nums">
						{formatCurrency(paymentProgress.settledAmount)}
					</span>{" "}
					of{" "}
					<span className="tabular-nums">
						{formatCurrency(
							paymentProgress.settledAmount + paymentProgress.remainingAmount,
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
	);
}

function ParticipantStatus({ isPaid }: { isPaid: boolean }) {
	return isPaid ? (
		<span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-muted px-2.5 py-1 font-semibold text-[11.5px] text-success-muted-foreground tracking-tight">
			<span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />
			Paid
		</span>
	) : (
		<span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2.5 py-1 font-semibold text-[11.5px] text-muted-foreground tracking-tight">
			Due
		</span>
	);
}

function ParticipantRow({
	participant,
}: { participant: PublicBillParticipant }) {
	return (
		<li className="flex items-center gap-3.5 py-3.5">
			<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-[13px] text-muted-foreground tracking-tight">
				{getInitials(participant.name)}
			</div>
			<div className="min-w-0 flex-1">
				<p className="truncate font-semibold text-[15px] leading-tight tracking-[-0.005em]">
					{participant.name || "Housemate"}
				</p>
				<p className="mt-1 text-[12.5px] text-muted-foreground leading-none">
					{participant.isOwner ? (
						"Paid the bill"
					) : (
						<span className="tabular-nums">
							{formatCurrency(participant.amountOwed)} share
						</span>
					)}
				</p>
			</div>
			<ParticipantStatus isPaid={participant.isPaid} />
		</li>
	);
}

function ParticipantsSection({
	participants,
}: {
	participants: PublicBillParticipant[];
}) {
	return (
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
					{participants.map((participant) => (
						<ParticipantRow key={participant.id} participant={participant} />
					))}
				</ul>
			)}
		</section>
	);
}

function BillFooterActions({
	bill,
	isAllSorted,
	links,
	payId,
	payNowAmount,
}: {
	bill: PublicBillPageData["bill"];
	isAllSorted: boolean;
	links: PublicBillPageData["links"];
	payId: string | null;
	payNowAmount: number;
}) {
	if (!bill.hasPdf && isAllSorted) {
		return null;
	}

	return (
		<div className="fixed inset-x-0 bottom-0 z-20 bg-background/95 px-5 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:static sm:z-auto sm:mt-auto sm:bg-transparent sm:px-0 sm:pt-0 sm:pb-0 sm:backdrop-blur-none">
			<div className="mx-auto flex w-full max-w-md flex-col gap-2.5">
				{bill.hasPdf ? (
					<Button asChild variant="outline" className="h-11 w-full font-medium">
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
	);
}

function PublicBillPage() {
	const loaderData = Route.useLoaderData();

	if (!loaderData) {
		return <ExpiredBillPage />;
	}

	const isAllSorted = loaderData.paymentProgress.percentage === 100;
	const statusBadge = getBillStatusBadge({
		isAllSorted,
		urgency: getBillDueStatus(loaderData.bill.dueDateIso),
	});
	const hasFooterActions = loaderData.bill.hasPdf || !isAllSorted;

	return (
		<div className="min-h-screen bg-background text-foreground">
			<div
				className={`mx-auto flex min-h-screen max-w-md flex-col gap-7 px-5 pt-5 ${hasFooterActions ? "pb-32 sm:pb-12" : "pb-6 sm:pb-12"} sm:min-h-0 sm:gap-8 sm:pt-8`}
			>
				<BillHero bill={loaderData.bill} statusBadge={statusBadge} />
				<BillProgressSection
					isAllSorted={isAllSorted}
					paymentProgress={loaderData.paymentProgress}
				/>
				<ParticipantsSection participants={loaderData.participants} />
				<BillFooterActions
					bill={loaderData.bill}
					isAllSorted={isAllSorted}
					links={loaderData.links}
					payId={loaderData.payId}
					payNowAmount={getPayNowAmount(loaderData)}
				/>
			</div>
		</div>
	);
}
