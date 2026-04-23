import { and, asc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { db } from "../db/index.server";
import { bills } from "../db/schema/bills";
import { debts } from "../db/schema/debts";
import { housemates } from "../db/schema/housemates";
import { recurringBills } from "../db/schema/recurring-bills";
import { BillPdfStorageService } from "./bill-pdf-storage";
import {
	createSignedPublicLinkToken,
	publicLinkSignaturesMatch,
	signPublicLinkPayload,
} from "./public-link-token";

type UtilityBillType = "electricity" | "gas";

export type PayTokenInput = {
	housemateId: string;
	stackGroup?: string | null;
	billIds?: string[] | null;
};

type PayPageItem = {
	billId: string;
	billerName: string;
	billType: string | null;
	recurringTemplateName: string | null;
	billPath: string;
	billUrl: string | null;
	dueDate: Date;
	billPeriodStart: Date | null;
	billPeriodEnd: Date | null;
	amountOwed: number;
	amountPaid: number;
	remainingAmount: number;
	isOverdue: boolean;
};

type PayPageGroup = {
	label: string;
	items: PayPageItem[];
};

type PayScope =
	| {
			kind: "all";
			stackGroup: null;
			billIds: null;
	  }
	| {
			kind: "stack";
			stackGroup: string;
			billIds: null;
	  }
	| {
			kind: "bills";
			stackGroup: null;
			billIds: string[];
	  };

export type PublicHousematePayPageData = {
	housemate: {
		id: string;
		name: string;
	};
	scope: PayScope & {
		allBillsPath: string | null;
	};
	summary: {
		billCount: number;
		overdueCount: number;
		utilityBillCount: number;
		otherBillCount: number;
	};
	paymentProgress: {
		settledAmount: number;
		remainingAmount: number;
		percentage: number;
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

function encodeStackGroup(stackGroup: string) {
	return Buffer.from(stackGroup, "utf8").toString("base64url");
}

function decodeStackGroup(encodedStackGroup: string) {
	return Buffer.from(encodedStackGroup, "base64url").toString("utf8").trim();
}

function normalizeBillIds(billIds: string[] | null | undefined) {
	if (!billIds) {
		return [];
	}

	return [
		...new Set(billIds.map((billId) => billId.trim()).filter(Boolean)),
	].sort((left, right) => left.localeCompare(right));
}

function encodeBillIds(billIds: string[]) {
	return Buffer.from(JSON.stringify(billIds), "utf8").toString("base64url");
}

function decodeBillIds(encodedBillIds: string) {
	try {
		const parsed = JSON.parse(
			Buffer.from(encodedBillIds, "base64url").toString("utf8"),
		);
		return Array.isArray(parsed)
			? normalizeBillIds(parsed.filter((value) => typeof value === "string"))
			: [];
	} catch {
		return [];
	}
}

export function createPayToken(input: PayTokenInput) {
	const housemateId = input.housemateId.trim();
	const stackGroup = input.stackGroup?.trim() ?? null;
	const billIds = normalizeBillIds(input.billIds);
	if (!housemateId) {
		return null;
	}

	if (billIds.length > 0) {
		const encodedBillIds = encodeBillIds(billIds);
		return createSignedPublicLinkToken(
			["bills", housemateId, encodedBillIds],
			`bills:${housemateId}:${billIds.join(",")}`,
		);
	}

	if (!stackGroup) {
		return createSignedPublicLinkToken(
			["all", housemateId],
			`all:${housemateId}`,
		);
	}

	return createSignedPublicLinkToken(
		["stack", housemateId, encodeStackGroup(stackGroup)],
		`stack:${housemateId}:${stackGroup}`,
	);
}

export function createPayPath(input: PayTokenInput) {
	const token = createPayToken(input);
	if (!token) {
		return null;
	}

	return BillPdfStorageService.getHousematePayUrl(token);
}

export function createAbsolutePayUrl(
	input: PayTokenInput,
	previewDate?: string | null,
) {
	const path = createPayPath(input);
	return path
		? BillPdfStorageService.getAbsoluteAppUrl(
				BillPdfStorageService.appendMessageCacheDate(path, previewDate),
			)
		: null;
}

function parseScopedPayToken(
	token: string,
): { housemateId: string; scope: PayScope } | null {
	const parts = token.split(".");

	if (parts[0] === "all" && parts.length === 3) {
		const [, housemateIdPart, signaturePart] = parts;
		const housemateId = housemateIdPart?.trim() ?? "";
		if (!housemateId || !signaturePart) {
			return null;
		}

		const expectedSignature = signPublicLinkPayload(`all:${housemateId}`);
		if (
			!expectedSignature ||
			!publicLinkSignaturesMatch(signaturePart, expectedSignature)
		) {
			return null;
		}

		return {
			housemateId,
			scope: {
				kind: "all",
				stackGroup: null,
				billIds: null,
			},
		};
	}

	if (parts[0] === "stack" && parts.length === 4) {
		const [, housemateIdPart, encodedStackGroup, signaturePart] = parts;
		const housemateId = housemateIdPart?.trim() ?? "";
		const stackGroup = encodedStackGroup
			? decodeStackGroup(encodedStackGroup)
			: "";
		if (!housemateId || !stackGroup || !signaturePart) {
			return null;
		}

		const expectedSignature = signPublicLinkPayload(
			`stack:${housemateId}:${stackGroup}`,
		);
		if (
			!expectedSignature ||
			!publicLinkSignaturesMatch(signaturePart, expectedSignature)
		) {
			return null;
		}

		return {
			housemateId,
			scope: {
				kind: "stack",
				stackGroup,
				billIds: null,
			},
		};
	}

	if (parts[0] === "bills" && parts.length === 4) {
		const [, housemateIdPart, encodedBillIds, signaturePart] = parts;
		const housemateId = housemateIdPart?.trim() ?? "";
		const billIds = encodedBillIds ? decodeBillIds(encodedBillIds) : [];
		if (!housemateId || billIds.length === 0 || !signaturePart) {
			return null;
		}

		const expectedSignature = signPublicLinkPayload(
			`bills:${housemateId}:${billIds.join(",")}`,
		);
		if (
			!expectedSignature ||
			!publicLinkSignaturesMatch(signaturePart, expectedSignature)
		) {
			return null;
		}

		return {
			housemateId,
			scope: {
				kind: "bills",
				stackGroup: null,
				billIds,
			},
		};
	}

	return null;
}

export function isUtilityBillType(
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
	const parsedToken = parseScopedPayToken(token.trim());
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
	const rows = await db
		.select({
			billId: bills.id,
			billerName: bills.billerName,
			billType: bills.billType,
			recurringTemplateName: recurringBills.templateName,
			stackGroup: bills.stackGroup,
			dueDate: bills.dueDate,
			billPeriodStart: bills.billPeriodStart,
			billPeriodEnd: bills.billPeriodEnd,
			amountOwed: debts.amountOwed,
			amountPaid: debts.amountPaid,
		})
		.from(debts)
		.innerJoin(bills, eq(bills.id, debts.billId))
		.leftJoin(recurringBills, eq(recurringBills.id, bills.recurringBillId))
		.where(
			and(
				eq(debts.housemateId, housemate.id),
				eq(debts.isPaid, false),
				...(parsedToken.scope.kind === "stack"
					? [eq(bills.stackGroup, parsedToken.scope.stackGroup)]
					: parsedToken.scope.kind === "bills"
						? [inArray(bills.id, parsedToken.scope.billIds)]
						: []),
			),
		)
		.orderBy(asc(bills.dueDate), asc(debts.id));

	const items = rows.map((row) => {
		const remainingAmount = Math.max(0, row.amountOwed - row.amountPaid);
		const dueDate = row.dueDate;
		const billPath = BillPdfStorageService.getViewerUrl(row.billId);
		return {
			billId: row.billId,
			billerName: row.billerName,
			billType: row.billType,
			recurringTemplateName: row.recurringTemplateName,
			billPath,
			billUrl: BillPdfStorageService.getAbsoluteAppUrl(billPath),
			dueDate,
			billPeriodStart: row.billPeriodStart,
			billPeriodEnd: row.billPeriodEnd,
			amountOwed: row.amountOwed,
			amountPaid: row.amountPaid,
			remainingAmount,
			isOverdue: dueDate.getTime() < today.getTime(),
		};
	});
	const utilityGroups =
		parsedToken.scope.kind === "all" ? groupUtilityItems(items) : [];
	const nonUtilityItems =
		parsedToken.scope.kind === "all"
			? items.filter((item) => !isUtilityBillType(item.billType))
			: items;

	const totalAmount = items.reduce((total, item) => total + item.amountOwed, 0);
	const remainingAmount = items.reduce(
		(total, item) => total + item.remainingAmount,
		0,
	);
	const settledAmount = Math.max(0, totalAmount - remainingAmount);
	const overdueCount = items.filter((item) => item.isOverdue).length;
	const utilityBillCount = items.filter((item) =>
		isUtilityBillType(item.billType),
	).length;
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
	const recentRows = await db
		.select({
			amountPaid: debts.amountPaid,
			paidAt: debts.paidAt,
		})
		.from(debts)
		.innerJoin(bills, eq(bills.id, debts.billId))
		.where(
			and(
				eq(debts.housemateId, housemate.id),
				eq(debts.isPaid, true),
				isNotNull(debts.paidAt),
				gte(debts.paidAt, recentSince),
				...(parsedToken.scope.kind === "stack"
					? [eq(bills.stackGroup, parsedToken.scope.stackGroup)]
					: parsedToken.scope.kind === "bills"
						? [inArray(bills.id, parsedToken.scope.billIds)]
						: []),
			),
		);
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
		summary: {
			billCount: items.length,
			overdueCount,
			utilityBillCount,
			otherBillCount: Math.max(0, items.length - utilityBillCount),
		},
		paymentProgress: {
			settledAmount,
			remainingAmount,
			percentage:
				totalAmount <= 0
					? 100
					: Math.round((settledAmount / totalAmount) * 100),
		},
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
