import { and, asc, eq, isNotNull } from "drizzle-orm";
import { db } from "../db/index.server";
import { housemates } from "../db/schema/housemates";
import { createAbsolutePayUrl } from "./housemate-pay-page.server";
import { type OverdueDigest, buildOverdueDigest } from "./overdue-digest";
import { getCoveredShares } from "./unpaid-shares.server";
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

async function digestFor(
	housemate: DigestHousemate,
	now: Date,
): Promise<HousemateDigest | null> {
	const covered = await getCoveredShares(housemate.id);
	const digest = buildOverdueDigest(covered.shares, covered.credit, now);
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
	const digests = await Promise.all(
		withNumber(rows).map((housemate) => digestFor(housemate, now)),
	);
	return digests.filter((entry) => entry !== null);
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
	return { notification, entry: await digestFor(housemate, now) };
}
