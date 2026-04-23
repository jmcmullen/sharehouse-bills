import { BillPdfStorageService } from "@/api/services/bill-pdf-storage";
import { Button } from "@/components/ui/button";
import { getPublicDebtReceipt } from "@/functions/public-debt-receipt";
import { getReceiptBillLabel } from "@/lib/debt-receipt";
import { buildOpenGraphMeta, formatCurrency } from "@/lib/share-preview";
import { createFileRoute } from "@tanstack/react-router";

const SECTION_LABEL_CLASS =
	"font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.12em]";

function formatDate(dateIso: string) {
	return new Intl.DateTimeFormat("en-AU", {
		weekday: "short",
		day: "numeric",
		month: "short",
		year: "numeric",
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

export const Route = createFileRoute("/receipt/$token")({
	loader: async ({ params, location }) =>
		await getPublicDebtReceipt({
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
					{ title: "This link has expired" },
					{ name: "robots", content: "noindex, nofollow" },
					{
						name: "description",
						content: "This payment receipt link is no longer available.",
					},
					{ property: "og:title", content: "Link expired" },
					{
						property: "og:description",
						content: "This payment receipt link is no longer available.",
					},
					{ property: "og:type", content: "website" },
				],
			};
		}

		const title = `${loaderData.housemate.name} paid ${formatCurrency(loaderData.receipt.amountPaid)}`;
		const billLabel = getReceiptBillLabel(loaderData.receipt);
		const description = `Paid ${formatDate(loaderData.receipt.paidAtIso)} for ${billLabel}.`;
		const previewDate = loaderData.previewDate;
		const token = loaderData.links.pagePath.split("/").pop() ?? "";
		const sharePageUrl = BillPdfStorageService.getAbsoluteDebtReceiptUrl(
			token,
			previewDate,
		);
		const shareOgImageUrl = BillPdfStorageService.getAbsoluteAppUrl(
			BillPdfStorageService.getDebtReceiptOgImageUrl(token, previewDate),
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

	component: PublicReceiptPage,
});

function PublicReceiptPage() {
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
							Hmm, this receipt&apos;s gone walkabout
						</h1>
						<p className="text-[14px] text-muted-foreground leading-6">
							The link might be old. Ask for a fresh payment confirmation if you
							still need it.
						</p>
					</div>
					<Button asChild variant="outline" className="h-11 font-medium">
						<a href="/">Head home</a>
					</Button>
				</div>
			</div>
		);
	}

	const billLabel = getReceiptBillLabel(loaderData.receipt);

	return (
		<div className="min-h-screen bg-background text-foreground">
			<div className="mx-auto flex min-h-screen max-w-md flex-col gap-7 px-5 pt-0 pb-32 sm:min-h-0 sm:gap-8 sm:pt-8 sm:pb-12">
				<header className="flex flex-col gap-3">
					<p className="truncate font-semibold text-[15px] tracking-tight">
						{loaderData.housemate.name}
					</p>
					<div className="flex flex-col gap-1">
						<p className={SECTION_LABEL_CLASS}>Paid</p>
						<h1 className="font-bold text-[3.25rem] tabular-nums leading-[1.02] tracking-[-0.03em]">
							{formatCurrency(loaderData.receipt.amountPaid)}
						</h1>
						<div>
							<span className="inline-flex items-center rounded-full bg-success-muted px-2.5 py-1 font-semibold text-[11.5px] text-success-muted-foreground tracking-tight">
								Payment confirmed
							</span>
						</div>
					</div>
				</header>

				<section className="space-y-2">
					<h2 className={SECTION_LABEL_CLASS}>Bill</h2>
					<div className="space-y-1">
						<p className="font-semibold text-[15px] leading-tight tracking-[-0.005em]">
							{billLabel}
						</p>
						<p className="text-[12.5px] text-muted-foreground leading-tight">
							{formatBillPeriod({
								billPeriodStartIso: loaderData.receipt.billPeriodStartIso,
								billPeriodEndIso: loaderData.receipt.billPeriodEndIso,
								dueDateIso: loaderData.receipt.dueDateIso,
							})}
						</p>
					</div>
				</section>

				<section>
					<h2 className={`pb-3 ${SECTION_LABEL_CLASS}`}>Receipt</h2>
					<div className="divide-y divide-border/60">
						<div className="flex items-center justify-between gap-4 py-3">
							<p className="text-[13px] text-muted-foreground">Paid on</p>
							<p className="text-right font-medium text-[13px]">
								{formatDate(loaderData.receipt.paidAtIso)}
							</p>
						</div>
						<div className="flex items-center justify-between gap-4 py-3">
							<p className="text-[13px] text-muted-foreground">Bill due</p>
							<p className="text-right font-medium text-[13px]">
								{formatDate(loaderData.receipt.dueDateIso)}
							</p>
						</div>
					</div>
				</section>

				<div className="fixed inset-x-0 bottom-0 z-20 bg-background/95 px-5 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:static sm:z-auto sm:mt-auto sm:bg-transparent sm:px-0 sm:pt-0 sm:pb-0 sm:backdrop-blur-none">
					<div className="mx-auto flex w-full max-w-md flex-col gap-2.5">
						<Button
							asChild
							variant="outline"
							className="h-11 w-full font-medium"
						>
							<a href={loaderData.links.billPath}>View bill</a>
						</Button>
						{loaderData.links.payPath ? (
							<Button asChild className="h-11 w-full font-medium">
								<a href={loaderData.links.payPath}>View unpaid bills</a>
							</Button>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
}
