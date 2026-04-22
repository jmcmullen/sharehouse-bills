import { and, eq } from "drizzle-orm";
import { db } from "../db/index.server";
import { bills } from "../db/schema/bills";
import { debts } from "../db/schema/debts";
import { housemates } from "../db/schema/housemates";
import { recurringBills } from "../db/schema/recurring-bills";
import { BillPdfStorageService } from "./bill-pdf-storage";
import { createPayPath } from "./housemate-pay-page.server";
import {
	createSignedPublicLinkToken,
	publicLinkSignaturesMatch,
	signPublicLinkPayload,
} from "./public-link-token";

export type DebtReceiptTokenInput = {
	debtId: string;
};

export type PublicDebtReceiptPageData = {
	housemate: {
		id: string;
		name: string;
	};
	receipt: {
		debtId: string;
		amountPaid: number;
		paidAt: Date;
		billId: string;
		billerName: string;
		recurringTemplateName: string | null;
		dueDate: Date;
		billPeriodStart: Date | null;
		billPeriodEnd: Date | null;
	};
	outstanding: {
		remainingAmount: number;
		unpaidBillCount: number;
	};
	links: {
		pagePath: string;
		pageUrl: string | null;
		ogImagePath: string;
		ogImageUrl: string | null;
		billPath: string;
		billUrl: string | null;
		payPath: string | null;
		payUrl: string | null;
	};
};

export function createDebtReceiptToken(input: DebtReceiptTokenInput) {
	const debtId = input.debtId.trim();
	if (!debtId) {
		return null;
	}

	return createSignedPublicLinkToken(["receipt", debtId], `receipt:${debtId}`);
}

export function createDebtReceiptPath(
	input: DebtReceiptTokenInput,
	previewDate?: string | null,
) {
	const token = createDebtReceiptToken(input);
	if (!token) {
		return null;
	}

	return BillPdfStorageService.getDebtReceiptUrl(token, previewDate);
}

export function createAbsoluteDebtReceiptUrl(
	input: DebtReceiptTokenInput,
	previewDate?: string | null,
) {
	const token = createDebtReceiptToken(input);
	return token
		? BillPdfStorageService.getAbsoluteDebtReceiptUrl(token, previewDate)
		: null;
}

function parseDebtReceiptToken(token: string) {
	const [kind, debtIdPart, signaturePart] = token.split(".");
	const debtId = debtIdPart?.trim() ?? "";
	if (kind !== "receipt" || !debtId || !signaturePart) {
		return null;
	}

	const expectedSignature = signPublicLinkPayload(`receipt:${debtId}`);
	if (
		!expectedSignature ||
		!publicLinkSignaturesMatch(signaturePart, expectedSignature)
	) {
		return null;
	}

	return { debtId };
}

export async function getPublicDebtReceiptPageData(
	token: string,
): Promise<PublicDebtReceiptPageData | null> {
	const parsedToken = parseDebtReceiptToken(token.trim());
	if (!parsedToken) {
		return null;
	}

	const [row] = await db
		.select({
			debtId: debts.id,
			amountOwed: debts.amountOwed,
			amountPaid: debts.amountPaid,
			isPaid: debts.isPaid,
			paidAt: debts.paidAt,
			billId: bills.id,
			billerName: bills.billerName,
			dueDate: bills.dueDate,
			billPeriodStart: bills.billPeriodStart,
			billPeriodEnd: bills.billPeriodEnd,
			recurringTemplateName: recurringBills.templateName,
			housemateId: housemates.id,
			housemateName: housemates.name,
		})
		.from(debts)
		.innerJoin(bills, eq(bills.id, debts.billId))
		.leftJoin(recurringBills, eq(recurringBills.id, bills.recurringBillId))
		.innerJoin(housemates, eq(housemates.id, debts.housemateId))
		.where(eq(debts.id, parsedToken.debtId))
		.limit(1);

	if (!row || !row.isPaid || !row.paidAt) {
		return null;
	}

	const outstandingRows = await db
		.select({
			amountOwed: debts.amountOwed,
			amountPaid: debts.amountPaid,
		})
		.from(debts)
		.where(
			and(eq(debts.housemateId, row.housemateId), eq(debts.isPaid, false)),
		);

	const remainingAmount = outstandingRows.reduce(
		(sum, debt) => sum + Math.max(0, debt.amountOwed - (debt.amountPaid ?? 0)),
		0,
	);
	const unpaidBillCount = outstandingRows.filter(
		(debt) => debt.amountOwed - (debt.amountPaid ?? 0) > 0.009,
	).length;

	const pagePath = BillPdfStorageService.getDebtReceiptUrl(token);
	const ogImagePath = BillPdfStorageService.getDebtReceiptOgImageUrl(token);
	const billPath = BillPdfStorageService.getViewerUrl(row.billId);
	const payPath =
		remainingAmount > 0.009
			? createPayPath({ housemateId: row.housemateId })
			: null;

	return {
		housemate: {
			id: row.housemateId,
			name: row.housemateName,
		},
		receipt: {
			debtId: row.debtId,
			amountPaid: row.amountPaid,
			paidAt: row.paidAt,
			billId: row.billId,
			billerName: row.billerName,
			recurringTemplateName: row.recurringTemplateName,
			dueDate: row.dueDate,
			billPeriodStart: row.billPeriodStart,
			billPeriodEnd: row.billPeriodEnd,
		},
		outstanding: {
			remainingAmount,
			unpaidBillCount,
		},
		links: {
			pagePath,
			pageUrl: BillPdfStorageService.getAbsoluteAppUrl(pagePath),
			ogImagePath,
			ogImageUrl: BillPdfStorageService.getAbsoluteAppUrl(ogImagePath),
			billPath,
			billUrl: BillPdfStorageService.getAbsoluteAppUrl(billPath),
			payPath,
			payUrl: payPath ? BillPdfStorageService.getAbsoluteAppUrl(payPath) : null,
		},
	};
}
