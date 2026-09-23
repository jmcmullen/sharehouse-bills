import { toast } from "sonner";
import {
	confirmLedgerReceipt,
	decideLedgerTransaction,
} from "../../functions/ledger";
import type { Payment } from "./review-payment";

// One-tap row decisions. Each reports its own outcome and resolves to whether
// the page should reload.
export async function confirmRow(
	payment: Payment,
	allocations: Array<{ debtId: string; amountCents: number }>,
): Promise<boolean> {
	if (!payment.housemateId) return false;
	try {
		await confirmLedgerReceipt({
			data: {
				transactionId: payment.id,
				housemateId: payment.housemateId,
				allocations,
				expectedRevision: payment.revision,
			},
		});
		toast.success(
			allocations.length
				? "Payment confirmed and bills updated"
				: "Payment kept as credit",
		);
		return true;
	} catch (error) {
		toast.error(
			error instanceof Error ? error.message : "Could not confirm the payment",
		);
		return false;
	}
}

export async function excludeRow(payment: Payment): Promise<boolean> {
	try {
		await decideLedgerTransaction({
			data: {
				transactionId: payment.id,
				action: "exclude",
				reason: "",
				expectedRevision: payment.revision,
			},
		});
		toast.success("Marked as not a household payment");
		return true;
	} catch (error) {
		toast.error(
			error instanceof Error ? error.message : "Could not save the decision",
		);
		return false;
	}
}
