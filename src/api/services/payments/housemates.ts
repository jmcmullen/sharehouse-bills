import type { BankHousemate } from "./model";
import type { Executor } from "./transaction";

export async function loadHousemates(tx: Executor): Promise<BankHousemate[]> {
	return (
		await tx.execute("SELECT id,name,bank_alias,is_owner FROM housemates")
	).rows.map((row) => ({
		id: String(row.id),
		name: String(row.name),
		bankAlias: row.bank_alias === null ? null : String(row.bank_alias),
		isOwner: Boolean(row.is_owner),
	}));
}

export async function requireHousemate(
	tx: Executor,
	housemateId: string | undefined,
): Promise<string> {
	const housemate = (await loadHousemates(tx)).find(
		(item) => item.id === housemateId && !item.isOwner,
	);
	if (!housemate) throw new Error("Select a non-owner housemate");
	return housemate.id;
}
