// fallow-ignore-file code-duplication
import { createServerFn } from "@tanstack/react-start";
import { createError } from "evlog";
import { z } from "zod";
import { db } from "../api/db/index.server";
import { bills } from "../api/db/schema/bills";
import { type Bill, summarizeBills } from "../api/services/account/account";
import { loadBills } from "../api/services/account/account.server";
import {
	insertBillWithShares,
	splitAcrossHousemates,
} from "../api/services/bills/shares";
import { withLedgerClient } from "../api/services/payments/client.server";
import { removeBill } from "../api/services/payments/remove-bill";
import { generateWeeklyRentBill } from "../api/services/recurring-bill";
import { enqueueBillCreatedNotification } from "../api/services/whatsapp-notification-events";
import { authMiddleware } from "../lib/auth-middleware";
import { entityIdSchema } from "../lib/id";
import { getRequestLogger } from "../lib/request-logger";

// Every bill with each housemate's share, paid state from the account module,
// and the totals for the summary cards.
export const getAllBills = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async () => {
		const [accountBills, files] = await Promise.all([
			loadBills(),
			db
				.select({
					id: bills.id,
					pdfUrl: bills.pdfUrl,
					pdfSha256: bills.pdfSha256,
					sourceFilename: bills.sourceFilename,
				})
				.from(bills),
		]);
		const byId = new Map(files.map((file) => [file.id, file]));
		return {
			bills: accountBills.map((bill) =>
				toBillListItem(bill, byId.get(bill.id)),
			),
			summary: summarizeBills(accountBills),
		};
	});

function toBillListItem(
	bill: Bill,
	file:
		| {
				pdfUrl: string | null;
				pdfSha256: string | null;
				sourceFilename: string | null;
		  }
		| undefined,
) {
	return {
		id: bill.id,
		billerName: bill.name,
		totalCents: bill.totalCents,
		dueAt: bill.dueAt,
		status: bill.status,
		paidCents: bill.paidCents,
		remainingCents: bill.remainingCents,
		publicPath: `/bill/${bill.id}`,
		pdfUrl: file?.pdfUrl ?? null,
		pdfSha256: file?.pdfSha256 ?? null,
		sourceFilename: file?.sourceFilename ?? null,
		shares: bill.shares.map((share) => ({
			id: share.id,
			housemateName: share.housemateName,
			amountCents: share.amountCents,
			paidCents: share.paidCents,
			remainingCents: share.remainingCents,
		})),
	};
}

// Create a new bill manually, split equally across the active housemates.
export const createBill = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			billerName: z.string().min(1),
			totalCents: z.number().int().positive(),
			dueDate: z.date(),
			pdfUrl: z.string().url().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const log = getRequestLogger();
		const splits = await splitAcrossHousemates(data.totalCents);
		const newBill = await insertBillWithShares(
			{
				billerName: data.billerName,
				totalCents: data.totalCents,
				dueDate: data.dueDate,
				pdfUrl: data.pdfUrl,
			},
			splits,
		);
		log?.set({
			bill: {
				id: newBill.id,
				billerName: data.billerName,
				totalCents: data.totalCents,
				dueDate: data.dueDate.toISOString(),
				source: "manual",
			},
			debts: { recordCount: splits.length },
		});
		await enqueueBillCreatedNotification(newBill.id, "manual");

		return newBill;
	});

// Delete a bill and all associated debts
export const deleteBill = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ billId: entityIdSchema }))
	.handler(async ({ data }) => {
		const log = getRequestLogger();
		log?.set({
			bill: {
				id: data.billId,
			},
		});
		await withLedgerClient((client) => removeBill(client, data.billId));
		log?.set({
			bill: {
				id: data.billId,
				deleted: true,
			},
		});

		return { success: true };
	});

// Generate weekly rent bill
export const generateWeeklyRent = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.handler(async () => {
		const log = getRequestLogger();
		log?.set({
			recurringBillGeneration: {
				templateName: "Weekly Rent",
			},
		});
		const billId = await generateWeeklyRentBill();
		if (!billId) {
			throw createError({
				message: "Failed to generate weekly rent bill",
				status: 500,
				why: "The Weekly Rent template did not produce a new bill.",
				fix: "Inspect recurring bill configuration and the recurring bill generation wide event.",
			});
		}
		log?.set({
			recurringBillGeneration: {
				templateName: "Weekly Rent",
				billId,
			},
		});

		return { success: true, billId };
	});
