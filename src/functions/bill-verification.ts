import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { approveBill } from "../api/services/ledger/bill-reviews";
import { loadBillVerification } from "../api/services/ledger/bill-verification";
import { createLedgerClient } from "../api/services/ledger/client.server";
import { authMiddleware } from "../lib/auth-middleware";

export const getBillVerification = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async () => {
		const client = createLedgerClient();
		try {
			return await loadBillVerification(client);
		} finally {
			client.close();
		}
	});

export const setBillReviewed = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({ billId: z.string().min(1), approved: z.boolean() }),
	)
	.handler(async ({ data }) => {
		const client = createLedgerClient();
		try {
			await approveBill(client, data.billId, data.approved);
		} finally {
			client.close();
		}
	});
