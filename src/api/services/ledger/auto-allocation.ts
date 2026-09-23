import type { Client } from "@libsql/client";
import { getAccountPayments } from "./account-payments";
import { writeBillAllocation } from "./bill-allocations";
import { sourceSchema } from "./model";

type Executor = Pick<Client, "execute">;

interface Fund {
	key: string;
	remainingCents: number;
	rentOnly: boolean;
}
interface Need {
	debtId: string;
	remainingCents: number;
	rent: boolean;
	dueAt: number | null;
}
interface AutoAllocation {
	key: string;
	debtId: string;
	amountCents: number;
}

// Oldest debt first, each filled from the oldest money still available to it.
function planAutoAllocations(funds: Fund[], needs: Need[]): AutoAllocation[] {
	const ordered = [...needs]
		.filter((need) => need.remainingCents > 0)
		.sort(
			(a, b) =>
				(a.dueAt ?? Number.MAX_SAFE_INTEGER) -
					(b.dueAt ?? Number.MAX_SAFE_INTEGER) ||
				a.debtId.localeCompare(b.debtId),
		);
	const plan: AutoAllocation[] = [];
	let available = funds.filter((fund) => fund.remainingCents > 0);
	for (const need of ordered) {
		let open = need.remainingCents;
		available = available.map((fund) => {
			const amount =
				fund.rentOnly && !need.rent ? 0 : Math.min(fund.remainingCents, open);
			if (amount <= 0) return fund;
			open -= amount;
			plan.push({ key: fund.key, debtId: need.debtId, amountCents: amount });
			return { ...fund, remainingCents: fund.remainingCents - amount };
		});
	}
	return plan;
}

export async function autoAllocate(
	tx: Executor,
	housemateId: string,
): Promise<void> {
	const account = await getAccountPayments(tx, housemateId);
	const reviewed = new Set(
		(
			await tx.execute({
				sql: "SELECT r.source_key FROM ledger_allocation_reviews r JOIN ledger_sources s ON s.source_key=r.source_key WHERE json_extract(s.snapshot,'$.housemateId')=?",
				args: [housemateId],
			})
		).rows.map((row) => String(row.source_key)),
	);
	const receipts = account.receipts
		.filter(
			(receipt) =>
				receipt.amountCents > 0 &&
				receipt.unallocatedCents > 0 &&
				receipt.allocationIssue === null &&
				!receipt.sourceKeys.some((key) => reviewed.has(key)),
		)
		.sort((a, b) => a.receivedAt - b.receivedAt || a.id.localeCompare(b.id));
	const funds = (
		await Promise.all(
			receipts.map((receipt) =>
				sourceFunds(tx, receipt.sourceKeys, receipt.rentOnly),
			),
		)
	).flat();
	const needs = account.bills.map((bill) => ({
		debtId: bill.id,
		remainingCents: bill.remainingCents,
		rent: /rent/i.test(bill.category),
		dueAt: bill.dueAt,
	}));
	for (const allocation of planAutoAllocations(funds, needs))
		await writeBillAllocation(
			tx,
			allocation.key,
			allocation.debtId,
			allocation.amountCents,
			"auto",
		);
}

async function sourceFunds(
	tx: Executor,
	keys: string[],
	rentOnly: boolean,
): Promise<Fund[]> {
	return (
		await tx.execute({
			sql: `SELECT s.source_key,s.snapshot,coalesce((SELECT sum(amount_cents) FROM ledger_bill_allocations WHERE source_key=s.source_key),0) AS allocated FROM ledger_sources s WHERE s.source_key IN (${keys.map(() => "?").join(",")}) ORDER BY s.source_key`,
			args: keys,
		})
	).rows.map((row) => ({
		key: String(row.source_key),
		remainingCents:
			-sourceSchema.parse(JSON.parse(String(row.snapshot))).amountCents -
			Number(row.allocated),
		rentOnly,
	}));
}

export async function autoAllocateAll(tx: Executor): Promise<void> {
	const housemates = (
		await tx.execute("SELECT id FROM housemates WHERE is_owner=0 ORDER BY id")
	).rows;
	for (const housemate of housemates)
		await autoAllocate(tx, String(housemate.id));
}
