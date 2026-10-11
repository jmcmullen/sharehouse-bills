import type { Client } from "@libsql/client";
import { z } from "zod";
import { getAccountPayments } from "./account-payments";
import { insertReceipt, writeAllocations } from "./allocate";
import { isRentReference } from "./model";
import { enqueuePaymentReceipt } from "./receipt-notifications";
import { nowSeconds, withWriteTransaction } from "./transaction";

export const cashReceiptSchema = z.object({
	debtId: z.string().min(1),
	amountCents: z.number().int().safe().positive(),
	receivedAt: z.number().int().positive(),
	note: z.string().trim().max(200).default(""),
});

// Records cash handed to the admin and allocates it to one bill share in the
// same transaction. It is the only way money enters without a bank transfer,
// and the housemate gets a receipt for it.
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
		if (isRentReference(data.note) && !/rent/i.test(share.category))
			throw new Error("Allocate a rent payment to rent bills");
		const receiptId = await insertReceipt(tx, {
			housemateId,
			amountCents: data.amountCents,
			receivedAt: data.receivedAt,
			kind: "cash",
			bankTransactionId: null,
			note: data.note,
		});
		await writeAllocations(
			tx,
			await getAccountPayments(tx, housemateId),
			receiptId,
			[{ debtId: data.debtId, amountCents: data.amountCents }],
		);
		await enqueuePaymentReceipt(tx, housemateId, receiptId, "receipt");
		return { receiptId };
	});
}
