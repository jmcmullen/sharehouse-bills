import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/index.server";
import { bills } from "../db/schema/bills";
import { debts } from "../db/schema/debts";
import { housemates } from "../db/schema/housemates";
import { BillPdfStorageService } from "./bill-pdf-storage";

type PublicBillDebtRecord = {
	id: string;
	amountOwed: number;
	amountPaid: number;
	isPaid: boolean;
};

export type PublicBillParticipant = {
	id: string;
	name: string;
	amountOwed: number;
	amountPaid: number;
	isPaid: boolean;
	isOwner: boolean;
};

export type PublicBillPageData = {
	bill: {
		id: string;
		billerName: string;
		billType: string | null;
		totalAmount: number;
		dueDate: Date;
		billPeriodStart: Date | null;
		billPeriodEnd: Date | null;
		pdfSha256: string | null;
		sourceFilename: string | null;
		hasPdf: boolean;
	};
	shareSummary: {
		participantCount: number;
		hasEvenShares: boolean;
		amountEach: number | null;
	};
	paymentProgress: {
		settledCount: number;
		remainingCount: number;
		percentage: number;
		settledAmount: number;
		remainingAmount: number;
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

function isDebtPaid(debt: PublicBillDebtRecord) {
	return debt.isPaid || debt.amountPaid >= debt.amountOwed - 0.005;
}

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

	const [rows, ownerRows] = await Promise.all([
		db
			.select({
				billId: bills.id,
				billerName: bills.billerName,
				billType: bills.billType,
				totalAmount: bills.totalAmount,
				dueDate: bills.dueDate,
				billPeriodStart: bills.billPeriodStart,
				billPeriodEnd: bills.billPeriodEnd,
				pdfSha256: bills.pdfSha256,
				pdfUrl: bills.pdfUrl,
				sourceFilename: bills.sourceFilename,
				debtId: debts.id,
				amountOwed: debts.amountOwed,
				amountPaid: debts.amountPaid,
				isPaid: debts.isPaid,
				housemateId: housemates.id,
				housemateName: housemates.name,
				housemateIsOwner: housemates.isOwner,
			})
			.from(bills)
			.leftJoin(debts, eq(debts.billId, bills.id))
			.leftJoin(housemates, eq(housemates.id, debts.housemateId))
			.where(billLookup)
			.orderBy(asc(debts.id)),
		db
			.select({
				id: housemates.id,
				name: housemates.name,
			})
			.from(housemates)
			.where(and(eq(housemates.isActive, true), eq(housemates.isOwner, true))),
	]);

	if (rows.length === 0) {
		return null;
	}

	const debtRecords = rows
		.filter((row) => row.debtId !== null)
		.map((row) => ({
			id: row.debtId as string,
			amountOwed: row.amountOwed as number,
			amountPaid: row.amountPaid as number,
			isPaid: row.isPaid as boolean,
		}));

	const settledDebtAmount = debtRecords.reduce(
		(total, debt) => total + Math.min(debt.amountPaid, debt.amountOwed),
		0,
	);
	const debtShareCount = debtRecords.length;
	const ownerCount = ownerRows.length;
	const participantCount = debtShareCount + ownerCount;
	const firstShareAmount =
		participantCount > 0
			? rows[0].totalAmount / participantCount
			: (debtRecords[0]?.amountOwed ?? null);
	const hasEvenShares =
		firstShareAmount !== null &&
		debtRecords.length > 0 &&
		debtRecords.every(
			(debt) => Math.abs(debt.amountOwed - firstShareAmount) < 0.005,
		);
	const settledCount = ownerCount + debtRecords.filter(isDebtPaid).length;
	const settledAmount =
		(ownerCount > 0 && firstShareAmount !== null
			? ownerCount * firstShareAmount
			: 0) + settledDebtAmount;
	const debtParticipants: PublicBillParticipant[] = rows
		.filter((row) => row.debtId !== null && row.housemateId !== null)
		.map((row) => ({
			id: row.housemateId as string,
			name: row.housemateName as string,
			amountOwed: row.amountOwed as number,
			amountPaid: row.amountPaid as number,
			isPaid: isDebtPaid({
				id: row.debtId as string,
				amountOwed: row.amountOwed as number,
				amountPaid: row.amountPaid as number,
				isPaid: row.isPaid as boolean,
			}),
			isOwner: false,
		}));

	const ownerParticipants: PublicBillParticipant[] = ownerRows.map((owner) => ({
		id: owner.id,
		name: owner.name,
		amountOwed: firstShareAmount ?? 0,
		amountPaid: firstShareAmount ?? 0,
		isPaid: true,
		isOwner: true,
	}));

	const participants: PublicBillParticipant[] = [
		...ownerParticipants,
		...debtParticipants,
	];
	const pagePath = BillPdfStorageService.getViewerUrl(rows[0].billId);
	const pdfPath = rows[0].pdfSha256
		? BillPdfStorageService.getPdfUrl(rows[0].pdfSha256)
		: "";
	const ogImagePath = BillPdfStorageService.getOgImageUrl(rows[0].billId);

	return {
		bill: {
			id: rows[0].billId,
			billerName: rows[0].billerName,
			billType: rows[0].billType,
			totalAmount: rows[0].totalAmount,
			dueDate: rows[0].dueDate,
			billPeriodStart: rows[0].billPeriodStart,
			billPeriodEnd: rows[0].billPeriodEnd,
			pdfSha256: rows[0].pdfSha256,
			sourceFilename: rows[0].sourceFilename,
			hasPdf: !!rows[0].pdfUrl,
		},
		shareSummary: {
			participantCount,
			hasEvenShares,
			amountEach: hasEvenShares ? firstShareAmount : null,
		},
		paymentProgress: {
			settledCount,
			remainingCount: Math.max(0, participantCount - settledCount),
			percentage:
				participantCount === 0
					? 0
					: Math.round((settledCount / participantCount) * 100),
			settledAmount,
			remainingAmount: Math.max(0, rows[0].totalAmount - settledAmount),
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
