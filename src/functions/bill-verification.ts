import { createServerFn } from "@tanstack/react-start";
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
