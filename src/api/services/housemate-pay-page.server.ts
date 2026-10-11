// fallow-ignore-file code-duplication
import type { Share } from "./account/account";
import { loadAccount } from "./account/account.server";
import { type PayShare, buildPaySummary, sum } from "./account/compute";
import { BillPdfStorageService } from "./bill-pdf-storage";
import {
	type PayScope,
	createPayToken,
	parsePayToken,
} from "./pay-token.server";

type UtilityBillType = "electricity" | "gas";

type PayPageItem = PayShare & {
	billId: string;
	billerName: string;
	billType: string | null;
	recurringTemplateName: string | null;
	billPath: string;
	billUrl: string | null;
	dueDate: Date;
	billPeriodStart: Date | null;
	billPeriodEnd: Date | null;
};

type PayPageGroup = {
	label: string;
	items: PayPageItem[];
};

export type PublicHousematePayPageData = {
	housemate: {
		id: string;
		name: string;
	};
	scope: PayScope & {
		allBillsPath: string | null;
	};
	// Counts and totals cover only what is still to pay once credit is applied.
	summary: {
		billCount: number;
		overdueCount: number;
		remainingCents: number;
		overdueCents: number;
	};
	paymentProgress: {
		settledCents: number;
		percentage: number;
	};
	credit: {
		heldCents: number;
		appliedCents: number;
	};
	recentlySettled: {
		amountCents: number;
		billCount: number;
		sinceIso: string;
		latestPaidIso: string | null;
	};
	items: PayPageItem[];
	utilityGroups: PayPageGroup[];
	nonUtilityItems: PayPageItem[];
	links: {
		pagePath: string;
		pageUrl: string | null;
		ogImagePath: string;
		ogImageUrl: string | null;
	};
};

const RECENT_WINDOW_SECONDS = 30 * 24 * 60 * 60;
function isUtilityBillType(
	billType: string | null | undefined,
): billType is UtilityBillType {
	return billType === "electricity" || billType === "gas";
}

function formatUtilityLabel(billType: string | null) {
	if (billType === "electricity") {
		return "Electricity";
	}
	if (billType === "gas") {
		return "Gas";
	}
	return "Utilities";
}

function groupUtilityItems(items: PayPageItem[]) {
	const groups = new Map<string, PayPageItem[]>();

	for (const item of items) {
		if (!isUtilityBillType(item.billType)) {
			continue;
		}

		const label = formatUtilityLabel(item.billType);
		const existingItems = groups.get(label);
		if (existingItems) {
			existingItems.push(item);
			continue;
		}

		groups.set(label, [item]);
	}

	return [...groups.entries()].map(([label, groupedItems]) => ({
		label,
		items: groupedItems,
	}));
}

function toDate(seconds: number | null): Date | null {
	return seconds === null ? null : new Date(seconds * 1000);
}

// Bills settled in the last 30 days, by when the money that paid them arrived.
function recentlySettled(shares: Share[], since: number) {
	const recent = shares.filter(
		(share) => share.settledAt !== null && share.settledAt >= since,
	);
	const latest = Math.max(0, ...recent.map((share) => share.settledAt ?? 0));
	return {
		amountCents: sum(recent, (share) => share.paidCents),
		billCount: recent.length,
		sinceIso: new Date(since * 1000).toISOString(),
		latestPaidIso: latest ? new Date(latest * 1000).toISOString() : null,
	};
}

export async function getPublicHousematePayPageData(token: string) {
	const parsedToken = parsePayToken(token.trim());
	if (!parsedToken) {
		return null;
	}

	const account = await loadAccount(parsedToken.housemateId);
	if (!account) {
		return null;
	}
	const housemate = account.housemate;

	const scoped = account.shares.filter((share) =>
		isInPayScope(share, parsedToken.scope),
	);
	const items = scoped
		.filter((share) => share.remainingCents > 0)
		.map(toPayPageItem);
	const utilityGroups =
		parsedToken.scope.kind === "all" ? groupUtilityItems(items) : [];
	const nonUtilityItems =
		parsedToken.scope.kind === "all"
			? items.filter((item) => !isUtilityBillType(item.billType))
			: items;
	const totals = buildPaySummary(items, account.creditCents);
	const canonicalToken = createPayToken({
		housemateId: housemate.id,
		billIds:
			parsedToken.scope.kind === "bills" ? parsedToken.scope.billIds : null,
		stackGroup:
			parsedToken.scope.kind === "stack" ? parsedToken.scope.stackGroup : null,
	});
	const allBillsToken =
		parsedToken.scope.kind === "stack" || parsedToken.scope.kind === "bills"
			? createPayToken({ housemateId: housemate.id })
			: null;
	const pagePath = canonicalToken
		? BillPdfStorageService.getHousematePayUrl(canonicalToken)
		: BillPdfStorageService.getHousematePayUrl(token.trim());
	const allBillsPath = allBillsToken
		? BillPdfStorageService.getHousematePayUrl(allBillsToken)
		: null;
	const ogImagePath = BillPdfStorageService.getPayOgImageUrl(
		canonicalToken ?? token.trim(),
	);

	return {
		housemate: {
			id: housemate.id,
			name: housemate.name,
		},
		scope: {
			...parsedToken.scope,
			allBillsPath,
		},
		...totals,
		recentlySettled: recentlySettled(
			scoped,
			Math.floor(Date.now() / 1000) - RECENT_WINDOW_SECONDS,
		),
		items,
		utilityGroups,
		nonUtilityItems,
		links: {
			pagePath,
			pageUrl: BillPdfStorageService.getAbsoluteAppUrl(pagePath),
			ogImagePath,
			ogImageUrl: BillPdfStorageService.getAbsoluteAppUrl(ogImagePath),
		},
	} satisfies PublicHousematePayPageData;
}

function isInPayScope(share: Share, scope: PayScope) {
	if (scope.kind === "stack") return share.stackGroup === scope.stackGroup;
	if (scope.kind === "bills") return scope.billIds.includes(share.billId);
	return true;
}

function toPayPageItem(share: Share): PayPageItem {
	const billPath = BillPdfStorageService.getViewerUrl(share.billId);
	return {
		amountCents: share.amountCents,
		paidCents: share.paidCents,
		remainingCents: share.remainingCents,
		coveredCents: share.coveredCents,
		leftCents: share.leftCents,
		isOverdue: share.overdue,
		billId: share.billId,
		billerName: share.name,
		billType: share.billType,
		recurringTemplateName: share.recurringTemplateName,
		billPath,
		billUrl: BillPdfStorageService.getAbsoluteAppUrl(billPath),
		dueDate: new Date(share.dueAt * 1000),
		billPeriodStart: toDate(share.billPeriodStart),
		billPeriodEnd: toDate(share.billPeriodEnd),
	};
}
