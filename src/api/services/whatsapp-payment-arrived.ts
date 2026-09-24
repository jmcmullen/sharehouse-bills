import type { Client } from "@libsql/client";
import { BillPdfStorageService } from "./bill-pdf-storage";
import {
	getAccountPayments,
	suggestBankReceipt,
} from "./ledger/account-payments";
import { paymentArrivedPayloadSchema } from "./ledger/arrival-notifications";
import { withLedgerClient } from "./ledger/client.server";

type Executor = Pick<Client, "execute">;
interface PaymentArrivedContext {
	owner: { id: string; firstName: string; whatsappNumber: string | null };
	transactionId: string;
	pending: boolean;
	shared: boolean;
	senderName: string;
	amountCents: number;
	receivedAt: Date;
	reference: string;
	suggestion: string[] | null;
	reviewUrl: string | null;
}

function paymentReviewPath(transactionId: string): string {
	return `/payment-review?query=${encodeURIComponent(transactionId)}`;
}

// Rebuilds the owner's arrival message from the live bank transaction, so it
// reflects the decision state and open bills at the moment it is sent.
export async function getPaymentArrivedNotificationContext(
	notificationId: string,
): Promise<PaymentArrivedContext | null> {
	return withLedgerClient(async (client) => {
		const row = (
			await client.execute({
				sql: "SELECT n.payload,h.id,h.name,h.whatsapp_number FROM whatsapp_notifications n JOIN housemates h ON h.id=n.housemate_id WHERE n.id=?",
				args: [notificationId],
			})
		).rows[0];
		if (!row) return null;
		const parsed = paymentArrivedPayloadSchema.safeParse(
			JSON.parse(String(row.payload)),
		);
		if (!parsed.success) return null;
		const payload = parsed.data;
		const bank = (
			await client.execute({
				sql: "SELECT decision,amount_cents,effective_at,message FROM ledger_bank_transactions WHERE id=?",
				args: [payload.transactionId],
			})
		).rows[0];
		if (!bank) return null;
		const amountCents = Number(bank.amount_cents);
		const receivedAt = Number(bank.effective_at);
		const reference = String(bank.message ?? "").trim();
		const senders = payload.housemateId
			? [payload.housemateId]
			: payload.sharedWith;
		const names = await housemateNames(client, senders);
		const name = String(row.name);
		return {
			owner: {
				id: String(row.id),
				firstName: name.trim().split(/\s+/)[0] ?? name,
				whatsappNumber:
					row.whatsapp_number === null ? null : String(row.whatsapp_number),
			},
			transactionId: payload.transactionId,
			pending: bank.decision === "review",
			shared: payload.housemateId === null,
			senderName: names.length ? names.join(" + ") : "an unknown sender",
			amountCents,
			receivedAt: new Date(receivedAt * 1000),
			reference,
			suggestion: payload.housemateId
				? await suggestionLines(client, payload.housemateId, {
						amountCents,
						receivedAt,
						message: reference,
					})
				: null,
			reviewUrl: BillPdfStorageService.getAbsoluteAppUrl(
				paymentReviewPath(payload.transactionId),
			),
		};
	});
}

async function housemateNames(
	client: Executor,
	ids: string[],
): Promise<string[]> {
	if (!ids.length) return [];
	const rows = (
		await client.execute({
			sql: `SELECT id,name FROM housemates WHERE id IN (${ids.map(() => "?").join(",")})`,
			args: ids,
		})
	).rows;
	return ids.flatMap((id) => {
		const row = rows.find((item) => String(item.id) === id);
		return row ? [String(row.name).trim().split(/\s+/)[0] ?? ""] : [];
	});
}

async function suggestionLines(
	client: Executor,
	housemateId: string,
	bank: { amountCents: number; receivedAt: number; message: string },
): Promise<string[] | null> {
	const account = await getAccountPayments(client, housemateId);
	const suggestion = suggestBankReceipt(account, bank);
	if (!suggestion) return null;
	return suggestion.allocations.flatMap((allocation) => {
		const bill = account.bills.find((item) => item.id === allocation.debtId);
		return bill
			? [
					`${shareLabel({ billName: bill.name, dueAt: bill.dueAt })}, ${money(allocation.amountCents)}`,
				]
			: [];
	});
}

function shareLabel(share: { billName: string; dueAt: number | null }): string {
	return share.dueAt === null
		? share.billName
		: `${share.billName} · ${new Intl.DateTimeFormat("en-AU", {
				timeZone: "Australia/Sydney",
				day: "numeric",
				month: "short",
			}).format(new Date(share.dueAt * 1000))}`;
}

function money(cents: number): string {
	return new Intl.NumberFormat("en-AU", {
		style: "currency",
		currency: "AUD",
	}).format(cents / 100);
}
