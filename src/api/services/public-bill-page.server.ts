// fallow-ignore-file code-duplication
import { and, eq } from "drizzle-orm";
import { distributeCents } from "../../lib/equal-split";
import { db } from "../db/index.server";
import { bills } from "../db/schema/bills";
import { housemates } from "../db/schema/housemates";
import { loadBill } from "./account/account.server";
import { paidPercentage, sum } from "./account/compute";
import { BillPdfStorageService } from "./bill-pdf-storage";

type PublicBillParticipant = {
	id: string;
	name: string;
	amountCents: number;
	paidCents: number;
	isPaid: boolean;
	isOwner: boolean;
};

export type PublicBillPageData = {
	bill: {
		id: string;
		billerName: string;
		billType: string | null;
		totalCents: number;
		dueDate: Date;
		settledAt: Date | null;
		billPeriodStart: Date | null;
		billPeriodEnd: Date | null;
		pdfSha256: string | null;
		recurringTemplateName: string | null;
		sourceFilename: string | null;
		hasPdf: boolean;
	};
	shareSummary: {
		participantCount: number;
		hasEvenShares: boolean;
		amountEachCents: number | null;
	};
	paymentProgress: {
		settledCount: number;
		remainingCount: number;
		percentage: number;
		settledCents: number;
		remainingCents: number;
	};
	participants: PublicBillParticipant[];
	links: {
		pagePath: string;
		pageUrl: string | null;
		pdfPath: string;
		pdfUrl: string | null;
		ogImagePath: string;
		ogImageUrl: string | null;
	};
};

function isPdfSha256Reference(reference: string) {
	return /^[a-f0-9]{64}$/i.test(reference);
}

export async function getPublicBillPageData(
	billReference: string,
): Promise<PublicBillPageData | null> {
	const normalizedReference = billReference.trim();
	if (!normalizedReference) {
		return null;
	}

	const billLookup = isPdfSha256Reference(normalizedReference)
		? eq(bills.pdfSha256, normalizedReference)
		: eq(bills.id, normalizedReference);

	const [[row], ownerRows] = await Promise.all([
		db
			.select({
				id: bills.id,
				pdfSha256: bills.pdfSha256,
				pdfUrl: bills.pdfUrl,
				sourceFilename: bills.sourceFilename,
			})
			.from(bills)
			.where(billLookup)
			.limit(1),
		db
			.select({
				id: housemates.id,
				name: housemates.name,
			})
			.from(housemates)
			.where(and(eq(housemates.isActive, true), eq(housemates.isOwner, true))),
	]);
	const bill = row ? await loadBill(row.id) : null;
	if (!row || !bill) {
		return null;
	}

	const shares = bill.shares.filter((share) => !share.isOwner);
	const ownerShares = distributeCents(
		bill.totalCents - sum(shares, (share) => share.amountCents),
		ownerRows.length,
	);
	const ownerParticipants: PublicBillParticipant[] = ownerRows.map(
		(owner, index) => ({
			id: owner.id,
			name: owner.name,
			amountCents: ownerShares[index] ?? 0,
			paidCents: ownerShares[index] ?? 0,
			isPaid: true,
			isOwner: true,
		}),
	);
	const shareParticipants: PublicBillParticipant[] = shares.map((share) => ({
		id: share.housemateId,
		name: share.housemateName,
		amountCents: share.amountCents,
		paidCents: share.paidCents,
		isPaid: share.remainingCents === 0,
		isOwner: false,
	}));
	const participants = [...ownerParticipants, ...shareParticipants];
	const participantCount = participants.length;
	const settledCount = participants.filter((item) => item.isPaid).length;
	const settledCents =
		sum(ownerShares, (cents) => cents) +
		sum(shares, (share) => Math.min(share.paidCents, share.amountCents));
	const firstShareCents = shares[0]?.amountCents ?? null;
	const hasEvenShares =
		firstShareCents !== null &&
		shares.every((share) => share.amountCents === firstShareCents);
	const toDate = (seconds: number | null) =>
		seconds === null ? null : new Date(seconds * 1000);
	const pagePath = BillPdfStorageService.getViewerUrl(bill.id);
	const pdfPath = row.pdfSha256
		? BillPdfStorageService.getPdfUrl(row.pdfSha256)
		: "";
	const ogImagePath = BillPdfStorageService.getOgImageUrl(bill.id);

	return {
		bill: {
			id: bill.id,
			billerName: bill.name,
			billType: bill.billType,
			totalCents: bill.totalCents,
			dueDate: new Date(bill.dueAt * 1000),
			settledAt: toDate(bill.settledAt),
			billPeriodStart: toDate(bill.billPeriodStart),
			billPeriodEnd: toDate(bill.billPeriodEnd),
			pdfSha256: row.pdfSha256,
			recurringTemplateName: bill.recurringTemplateName,
			sourceFilename: row.sourceFilename,
			hasPdf: !!row.pdfUrl,
		},
		shareSummary: {
			participantCount,
			hasEvenShares,
			amountEachCents: hasEvenShares ? firstShareCents : null,
		},
		paymentProgress: {
			settledCount,
			remainingCount: participantCount - settledCount,
			percentage: paidPercentage(settledCents, bill.totalCents),
			settledCents,
			remainingCents: Math.max(0, bill.totalCents - settledCents),
		},
		participants,
		links: {
			pagePath,
			pageUrl: BillPdfStorageService.getAbsoluteAppUrl(pagePath),
			pdfPath,
			pdfUrl: pdfPath ? BillPdfStorageService.getAbsoluteAppUrl(pdfPath) : null,
			ogImagePath,
			ogImageUrl: BillPdfStorageService.getAbsoluteAppUrl(ogImagePath),
		},
	};
}
