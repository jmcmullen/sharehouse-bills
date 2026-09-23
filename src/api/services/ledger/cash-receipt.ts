import type { Client } from "@libsql/client";
import { z } from "zod";
import { getAccountPayments } from "./account-payments";
import { writeBillAllocation } from "./bill-allocations";
import { isRentReference } from "./model";
import { enqueuePaymentReceipt } from "./receipt-notifications";
import { applySource, nowSeconds, withWriteTransaction } from "./sources";

export const cashReceiptSchema = z.object({
	debtId: z.string().min(1),
	amountCents: z.number().int().safe().positive(),
	receivedAt: z.number().int().positive(),
	note: z.string().trim().max(200).default(""),
});

// Records cash handed to the admin and allocates it to one bill share in the
// same ledger transaction. Cash has no bank evidence, so the admin's word is
// the review: the receipt is marked reviewed and the housemate gets a receipt.
export async function recordCashReceipt(
	client: Client,
	input: z.input<typeof cashReceiptSchema>,
): Promise<{ receiptId: string }> {
	const data = cashReceiptSchema.parse(input);
	if (data.receivedAt > nowSeconds())
		throw new Error("Cash received cannot have a future date");
	return withWriteTransaction(client, async (tx) => {
		const debt = (
			await tx.execute({
				sql: "SELECT d.housemate_id FROM debts d JOIN housemates h ON h.id=d.housemate_id WHERE d.id=? AND h.is_owner=0",
				args: [data.debtId],
			})
		).rows[0];
		if (!debt) throw new Error("Bill share not found");
		const housemateId = String(debt.housemate_id);
		const share = (await getAccountPayments(tx, housemateId)).bills.find(
			(bill) => bill.id === data.debtId,
		);
		if (!share) throw new Error("Bill share not found");
		if (data.amountCents > share.remainingCents)
			throw new Error("Cash exceeds the remaining share");
		const description = ["Cash received", data.note]
			.filter(Boolean)
			.join(" · ");
		if (isRentReference(description) && !/rent/i.test(share.category))
			throw new Error("Allocate a rent payment to rent bills");
		const key = `manual:cash-${crypto.randomUUID()}`;
		await applySource(tx, key, {
			housemateId,
			kind: "payment",
			amountCents: -data.amountCents,
			description,
			billId: null,
			effectiveAt: data.receivedAt,
			dueAt: null,
		});
		await tx.execute({
			sql: "INSERT INTO ledger_allocation_reviews(source_key,reviewed_at) VALUES (?,unixepoch())",
			args: [key],
		});
		await writeBillAllocation(tx, key, data.debtId, data.amountCents, "review");
		await enqueuePaymentReceipt(tx, housemateId, key, "receipt");
		return { receiptId: key };
	});
}
