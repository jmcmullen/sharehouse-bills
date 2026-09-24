// fallow-ignore-file code-duplication
import { and, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { db } from "../db/index.server";
import { bills } from "../db/schema/bills";
import { debts } from "../db/schema/debts";
import { housemates } from "../db/schema/housemates";
import { BillPdfStorageService } from "./bill-pdf-storage";
import {
	type PayShare,
	buildPaySummary,
	toPayShare,
} from "./housemate-pay-summary";
import {
	type PayScope,
	createPayToken,
	parsePayToken,
} from "./pay-token.server";
import { type CoveredShare, getCoveredShares } from "./unpaid-shares.server";

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
		remainingAmount: number;
		overdueAmount: number;
	};
	paymentProgress: {
		settledAmount: number;
		percentage: number;
	};
	credit: {
		heldAmount: number;
		appliedAmount: number;
	};
	recentlySettled: {
		amount: number;
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

function startOfUtcDay(date: Date) {
	return new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
	);
}

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

export async function getPublicHousematePayPageData(token: string) {
	const parsedToken = parsePayToken(token.trim());
	if (!parsedToken) {
		return null;
	}

	const [housemate] = await db
		.select({
			id: housemates.id,
			name: housemates.name,
		})
		.from(housemates)
		.where(eq(housemates.id, parsedToken.housemateId))
		.limit(1);

	if (!housemate) {
		return null;
	}

	const today = startOfUtcDay(new Date());
	const covered = await getCoveredShares(housemate.id);
	const items = covered.shares
		.filter((share) => isInPayScope(share, parsedToken.scope))
		.map((share) => toPayPageItem(share, today));
	const utilityGroups =
		parsedToken.scope.kind === "all" ? groupUtilityItems(items) : [];
	const nonUtilityItems =
		parsedToken.scope.kind === "all"
			? items.filter((item) => !isUtilityBillType(item.billType))
			: items;
	const totals = buildPaySummary(items, covered.credit.amountCents / 100);
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

	const RECENT_WINDOW_DAYS = 30;
	const recentSince = new Date(
		Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
	);
	const recentRows = await getRecentPaidDebtRows({
		housemateId: housemate.id,
		scope: parsedToken.scope,
		recentSince,
	});
	const recentlySettledAmount = recentRows.reduce(
		(total, row) => total + row.amountPaid,
		0,
	);
	const latestPaidAt = recentRows.reduce<Date | null>((latest, row) => {
		if (!row.paidAt) return latest;
		if (!latest || row.paidAt.getTime() > latest.getTime()) return row.paidAt;
		return latest;
	}, null);

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
		recentlySettled: {
			amount: recentlySettledAmount,
			billCount: recentRows.length,
			sinceIso: recentSince.toISOString(),
			latestPaidIso: latestPaidAt ? latestPaidAt.toISOString() : null,
		},
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

function getPayScopeConditions(scope: PayScope) {
	if (scope.kind === "stack") {
		return [eq(bills.stackGroup, scope.stackGroup)];
	}

	if (scope.kind === "bills") {
		return [inArray(bills.id, scope.billIds)];
	}

	return [];
}

function isInPayScope(share: CoveredShare, scope: PayScope) {
	if (scope.kind === "stack") return share.stackGroup === scope.stackGroup;
	if (scope.kind === "bills") return scope.billIds.includes(share.billId);
	return true;
}

function toPayPageItem(share: CoveredShare, today: Date): PayPageItem {
	const billPath = BillPdfStorageService.getViewerUrl(share.billId);
	return {
		...toPayShare(share, share.dueDate.getTime() < today.getTime()),
		billId: share.billId,
		billerName: share.billerName,
		billType: share.billType,
		recurringTemplateName: share.recurringTemplateName,
		billPath,
		billUrl: BillPdfStorageService.getAbsoluteAppUrl(billPath),
		dueDate: share.dueDate,
		billPeriodStart: share.billPeriodStart,
		billPeriodEnd: share.billPeriodEnd,
	};
}

async function getRecentPaidDebtRows(input: {
	housemateId: string;
	scope: PayScope;
	recentSince: Date;
}) {
	return await db
		.select({
			amountPaid: debts.amountPaid,
			paidAt: debts.paidAt,
		})
		.from(debts)
		.innerJoin(bills, eq(bills.id, debts.billId))
		.where(
			and(
				eq(debts.housemateId, input.housemateId),
				eq(debts.isPaid, true),
				isNotNull(debts.paidAt),
				gte(debts.paidAt, input.recentSince),
				...getPayScopeConditions(input.scope),
			),
		);
}
