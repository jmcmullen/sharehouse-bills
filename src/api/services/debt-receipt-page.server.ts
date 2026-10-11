// fallow-ignore-file code-duplication
import { eq } from "drizzle-orm";
import { db } from "../db/index.server";
import { debts } from "../db/schema/debts";
import { loadAccount } from "./account/account.server";
import { BillPdfStorageService } from "./bill-pdf-storage";
import { createPayPath } from "./pay-token.server";
import {
	createSignedPublicLinkToken,
	publicLinkSignaturesMatch,
	signPublicLinkPayload,
} from "./public-link-token";

type DebtReceiptTokenInput = {
	debtId: string;
};

type PublicDebtReceiptPageData = {
	housemate: {
		id: string;
		name: string;
	};
	receipt: {
		debtId: string;
		paidCents: number;
		paidAt: Date;
		billId: string;
		billerName: string;
		recurringTemplateName: string | null;
		dueDate: Date;
		billPeriodStart: Date | null;
		billPeriodEnd: Date | null;
	};
	outstanding: {
		remainingCents: number;
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

function createDebtReceiptToken(input: DebtReceiptTokenInput) {
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

	const [debt] = await db
		.select({ housemateId: debts.housemateId })
		.from(debts)
		.where(eq(debts.id, parsedToken.debtId))
		.limit(1);
	const account = debt ? await loadAccount(debt.housemateId) : null;
	const share = account?.shares.find((item) => item.id === parsedToken.debtId);
	// A receipt exists only once the share is paid in full.
	if (
		!account ||
		!share ||
		share.remainingCents > 0 ||
		share.settledAt === null
	) {
		return null;
	}
	const toDate = (seconds: number | null) =>
		seconds === null ? null : new Date(seconds * 1000);

	const pagePath = BillPdfStorageService.getDebtReceiptUrl(token);
	const ogImagePath = BillPdfStorageService.getDebtReceiptOgImageUrl(token);
	const billPath = BillPdfStorageService.getViewerUrl(share.billId);
	const payPath =
		account.owesCents > 0
			? createPayPath({ housemateId: account.housemate.id })
			: null;

	return {
		housemate: {
			id: account.housemate.id,
			name: account.housemate.name,
		},
		receipt: {
			debtId: share.id,
			paidCents: share.paidCents,
			// When the money arrived, not when the ledger recorded it.
			paidAt: new Date(share.settledAt * 1000),
			billId: share.billId,
			billerName: share.name,
			recurringTemplateName: share.recurringTemplateName,
			dueDate: new Date(share.dueAt * 1000),
			billPeriodStart: toDate(share.billPeriodStart),
			billPeriodEnd: toDate(share.billPeriodEnd),
		},
		outstanding: {
			remainingCents: account.owesCents,
			unpaidBillCount: account.shares.filter((item) => item.leftCents > 0)
				.length,
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
