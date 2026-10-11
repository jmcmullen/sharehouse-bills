import type { Client } from "@libsql/client";
import { z } from "zod";
import { getAccountPayments } from "./account-payments";
import {
	billAllocationsSchema,
	insertReceipt,
	writeAllocations,
} from "./allocate";
import { enqueuePaymentReceipt } from "./receipt-notifications";
import { nowSeconds, withWriteTransaction } from "./transaction";

export const cashReceiptSchema = z.object({
	housemateId: z.string().min(1),
	amountCents: z.number().int().safe().positive(),
	receivedAt: z.number().int().positive(),
	note: z.string().trim().max(200).default(""),
	allocations: billAllocationsSchema,
	expectedRevision: z.string(),
});

// Records cash handed to the admin as one receipt and allocates it to the
// housemate's shares in the same transaction. Empty allocations keep it as
// credit. It is the only way money enters without a bank transfer, and the
// housemate gets a receipt for it.
export async function recordCashReceipt(
	client: Client,
	input: z.input<typeof cashReceiptSchema>,
): Promise<{ receiptId: string }> {
	const data = cashReceiptSchema.parse(input);
	if (data.receivedAt > nowSeconds())
		throw new Error("Cash received cannot have a future date");
	return withWriteTransaction(client, async (tx) => {
		const housemate = (
			await tx.execute({
				sql: "SELECT id FROM housemates WHERE id=? AND is_owner=0",
				args: [data.housemateId],
			})
		).rows[0];
		if (!housemate) throw new Error("Housemate not found");
		const before = await getAccountPayments(tx, data.housemateId);
		if (before.revision !== data.expectedRevision)
			throw new Error("Payments or bills changed. Refresh before saving.");
		const receiptId = await insertReceipt(tx, {
			housemateId: data.housemateId,
			amountCents: data.amountCents,
			receivedAt: data.receivedAt,
			kind: "cash",
			bankTransactionId: null,
			note: data.note,
		});
		// The receipt's description carries the note, so a note saying rent
		// limits the cash to rent bills.
		await writeAllocations(
			tx,
			await getAccountPayments(tx, data.housemateId),
			receiptId,
			data.allocations,
		);
		await enqueuePaymentReceipt(tx, data.housemateId, receiptId, "receipt");
		return { receiptId };
	});
}
