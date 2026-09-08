import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { createLedgerClient } from "../api/services/ledger/client.server";
import {
	createStatementLink,
	getPrivateStatement,
} from "../api/services/ledger/statement-access";
import { authMiddleware } from "../lib/auth-middleware";

export const issueStatementLink = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ housemateId: z.string().min(1) }))
	.handler(async ({ data }) => {
		const client = createLedgerClient();
		try {
			return await createStatementLink(client, data.housemateId);
		} finally {
			client.close();
		}
	});
export const revokeStatementLink = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ housemateId: z.string().min(1) }))
	.handler(async ({ data }) => {
		const client = createLedgerClient();
		try {
			await client.execute({
				sql: "DELETE FROM ledger_statement_links WHERE housemate_id=?",
				args: [data.housemateId],
			});
			return { success: true };
		} finally {
			client.close();
		}
	});
export const getHousemateStatement = createServerFn({ method: "GET" })
	.inputValidator(z.object({ token: z.string().min(1).max(200) }))
	.handler(async ({ data }) => {
		setResponseHeader("Cache-Control", "private, no-store");
		setResponseHeader("Referrer-Policy", "no-referrer");
		setResponseHeader("X-Robots-Tag", "noindex, nofollow");
		const client = createLedgerClient();
		try {
			return await getPrivateStatement(client, data.token);
		} finally {
			client.close();
		}
	});
