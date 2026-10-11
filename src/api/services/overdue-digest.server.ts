import { and, asc, eq, isNotNull } from "drizzle-orm";
import { db } from "../db/index.server";
import { housemates } from "../db/schema/housemates";
import type { Account } from "./account/account";
import { loadAccount, loadAccounts } from "./account/account.server";
import { type OverdueDigest, buildOverdueDigest } from "./overdue-digest";
import { createAbsolutePayUrl } from "./pay-token.server";
import { buildOverdueDigestSummary } from "./whatsapp-message-composer";
import { getWhatsappNotificationById } from "./whatsapp-notifications";

interface DigestHousemate {
	id: string;
	name: string;
	whatsappNumber: string;
}
interface HousemateDigest {
	housemate: DigestHousemate;
	digest: OverdueDigest;
}

const recipient = {
	id: housemates.id,
	name: housemates.name,
	whatsappNumber: housemates.whatsappNumber,
};

function withNumber(
	rows: Array<
		Omit<DigestHousemate, "whatsappNumber"> & { whatsappNumber: string | null }
	>,
): DigestHousemate[] {
	return rows.flatMap((row) =>
		row.whatsappNumber ? [{ ...row, whatsappNumber: row.whatsappNumber }] : [],
	);
}

function seconds(date: Date): number {
	return Math.floor(date.getTime() / 1000);
}

function digestFor(
	housemate: DigestHousemate,
	account: Account | null | undefined,
	now: Date,
): HousemateDigest | null {
	const digest = account ? buildOverdueDigest(account.shares, now) : null;
	return digest ? { housemate, digest } : null;
}

// Every housemate who would get a digest right now: non-owners with a
// WhatsApp number and something still owing past its due date.
export async function getOverdueDigests(now: Date): Promise<HousemateDigest[]> {
	const rows = await db
		.select(recipient)
		.from(housemates)
		.where(
			and(eq(housemates.isOwner, false), isNotNull(housemates.whatsappNumber)),
		)
		.orderBy(asc(housemates.name));
	const accounts = new Map(
		(await loadAccounts({ now: seconds(now) })).map((account) => [
			account.housemate.id,
			account,
		]),
	);
	return withNumber(rows).flatMap(
		(housemate) => digestFor(housemate, accounts.get(housemate.id), now) ?? [],
	);
}

export function composeOverdueDigest(
	entry: HousemateDigest,
	previewDate?: string | null,
): string | null {
	const payUrl = createAbsolutePayUrl(
		{ housemateId: entry.housemate.id },
		previewDate,
	);
	if (!payUrl) return null;
	const name = entry.housemate.name.trim();
	return buildOverdueDigestSummary({
		...entry.digest,
		firstName: name.split(/\s+/)[0] ?? name,
		payUrl,
	});
}

// Recomputed when the workflow sends, so a payment that lands between the
// cron and the send is never chased.
export async function getOverdueDigestNotificationContext(
	notificationId: string,
	now = new Date(),
) {
	const notification = await getWhatsappNotificationById(notificationId);
	if (!notification?.housemateId) return null;
	const [housemate] = withNumber(
		await db
			.select(recipient)
			.from(housemates)
			.where(eq(housemates.id, notification.housemateId))
			.limit(1),
	);
	if (!housemate) return null;
	const account = await loadAccount(housemate.id, { now: seconds(now) });
	return { notification, entry: digestFor(housemate, account, now) };
}
