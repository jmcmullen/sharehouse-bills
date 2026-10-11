import { eq } from "drizzle-orm";
import { createError } from "evlog";
import { type Split, splitEqually } from "../../../lib/equal-split";
import { db } from "../../db/index.server";
import { debts } from "../../db/schema/debts";
import { housemates } from "../../db/schema/housemates";

type Writer = Pick<typeof db, "insert">;

// The one place bill shares are written. Every bill, however it arrives,
// becomes shares through here.
export async function createShares(
	billId: string,
	splits: Split[],
	client: Writer = db,
): Promise<void> {
	if (!splits.length)
		throw createError({
			message: "A bill needs at least one share",
			status: 500,
			why: `Bill ${billId} was created without any housemate shares.`,
			fix: "Assign the bill to at least one active non-owner housemate.",
		});
	await client.insert(debts).values(
		splits.map((split) => ({
			billId,
			housemateId: split.housemateId,
			amountCents: split.amountCents,
		})),
	);
}

// An equal split of a new bill across every active housemate. Owners pay the
// bill up front, so only non-owners get shares.
export async function splitAcrossHousemates(
	totalCents: number,
): Promise<Split[]> {
	const active = await db
		.select({ housemateId: housemates.id, isOwner: housemates.isOwner })
		.from(housemates)
		.where(eq(housemates.isActive, true));
	if (!active.some((housemate) => !housemate.isOwner))
		throw createError({
			message: "No active non-owner housemates found",
			status: 500,
			why: "A bill cannot be split because no active housemate is a non-owner.",
			fix: "Add or reactivate at least one non-owner housemate before creating a bill.",
		});
	return splitEqually(totalCents, active);
}
