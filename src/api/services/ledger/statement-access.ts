import { createHash, randomBytes } from "node:crypto";
import type { Client } from "@libsql/client";
import { type StatementRow, currentStatement } from "./model";
import { drainLedgerEvents, getAccountStatement } from "./store";

interface PrivateStatement {
	name: string;
	expiresAt: number;
	asOf: number;
	balanceCents: number;
	dueNowCents: number;
	upcomingCents: number;
	reviewCount: number;
	updatesPending: boolean;
	entries: Array<
		Pick<
			StatementRow,
			| "id"
			| "kind"
			| "amountCents"
			| "effectiveAt"
			| "dueAt"
			| "runningBalanceCents"
			| "description"
		> & { isReversal: boolean }
	>;
}

const tokenHash = (token: string): string =>
	createHash("sha256").update(token).digest("hex");

export async function createStatementLink(
	client: Client,
	housemateId: string,
	now = Math.floor(Date.now() / 1000),
): Promise<{ path: string; expiresAt: number }> {
	const housemate = (
		await client.execute({
			sql: "SELECT id FROM housemates WHERE id=? AND is_owner=0",
			args: [housemateId],
		})
	).rows[0];
	if (!housemate) throw new Error("Housemate not found");
	const token = randomBytes(32).toString("base64url");
	const expiresAt = now + 90 * 86400;
	await client.execute({
		sql: "INSERT INTO ledger_statement_links(housemate_id,token_hash,created_at,expires_at) VALUES(?,?,?,?) ON CONFLICT(housemate_id) DO UPDATE SET token_hash=excluded.token_hash,created_at=excluded.created_at,expires_at=excluded.expires_at",
		args: [housemateId, tokenHash(token), now, expiresAt],
	});
	return { path: `/statement/${token}`, expiresAt };
}

export async function getPrivateStatement(
	client: Client,
	token: string,
	now = Math.floor(Date.now() / 1000),
): Promise<PrivateStatement | null> {
	if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
	const housemate = (
		await client.execute({
			sql: "SELECT h.id,h.name,l.expires_at FROM ledger_statement_links l JOIN housemates h ON h.id=l.housemate_id WHERE l.token_hash=? AND l.expires_at>? AND h.is_owner=0",
			args: [tokenHash(token), now],
		})
	).rows[0];
	if (!housemate) return null;
	await drainLedgerEvents(client);
	const statement = currentStatement(
		await getAccountStatement(client, String(housemate.id), now),
		now,
	);
	const review = (
		await client.execute({
			sql: "SELECT count(*) AS count FROM ledger_bank_transactions WHERE housemate_id=? AND decision='review' AND amount_cents>0",
			args: [housemate.id],
		})
	).rows[0];
	const pending = Number(
		(
			await client.execute(
				"SELECT count(*) AS count FROM ledger_events WHERE processed_at IS NULL",
			)
		).rows[0].count,
	);
	return {
		name: String(housemate.name),
		expiresAt: Number(housemate.expires_at),
		asOf: now,
		balanceCents: statement.balanceCents,
		dueNowCents: statement.dueNowCents,
		upcomingCents: statement.upcomingCents,
		reviewCount: Number(review.count),
		updatesPending: pending > 0,
		entries: statement.entries.map((entry) => ({
			id: entry.id,
			kind: entry.kind,
			amountCents: entry.amountCents,
			effectiveAt: entry.effectiveAt,
			dueAt: entry.dueAt,
			runningBalanceCents: entry.runningBalanceCents,
			description:
				entry.kind === "payment" || entry.kind === "refund"
					? entry.kind === "refund"
						? "Payment returned"
						: [
								"Payment received",
								...entry.description.split(" · ").slice(1),
							].join(" · ")
					: entry.description,
			isReversal: entry.reversesEntryId !== null,
		})),
	};
}
