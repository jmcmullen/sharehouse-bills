import { createHash } from "node:crypto";
import {
	type Account,
	type Receipt,
	type Share,
	openShares,
} from "../account/account";
import { loadAccount } from "../account/account.server";
import { isRentReference } from "./model";
import {
	type OpenShare,
	type Suggestion,
	suggestAllocations,
} from "./suggestions";
import type { Executor } from "./transaction";

export type BillPaymentView = Share;
export interface ReceiptView extends Receipt {
	suggestion: Suggestion | null;
}
// The payment review's view of one account: shares newest due first, and a
// suggestion for every receipt with money still unallocated.
export interface AccountPayments {
	revision: string;
	bills: BillPaymentView[];
	receipts: ReceiptView[];
	unallocatedCents: number;
	unpaidCents: number;
}

export async function getAccountPayments(
	client: Executor,
	housemateId: string,
): Promise<AccountPayments> {
	const account = await loadAccount(housemateId, { client });
	if (!account) throw new Error("Housemate not found");
	return toAccountPayments(account);
}

export function toAccountPayments(account: Account): AccountPayments {
	const shares = toOpenShares(account);
	return {
		revision: revisionOf(account),
		bills: [...account.shares].sort(
			(a, b) => b.dueAt - a.dueAt || a.id.localeCompare(b.id),
		),
		receipts: account.receipts.map((receipt) => ({
			...receipt,
			suggestion:
				receipt.unallocatedCents > 0
					? suggestAllocations({
							amountCents: receipt.unallocatedCents,
							receivedAt: receipt.receivedAt,
							rentOnly: receipt.rentOnly,
							shares,
						})
					: null,
		})),
		unallocatedCents: account.creditCents,
		unpaidCents: account.remainingCents,
	};
}

// A hash of what is stored, never of what is derived from the clock, so a form
// left open across Sydney midnight is not reported as changed.
function revisionOf(account: Pick<Account, "shares" | "receipts">): string {
	const stored = [
		account.shares.map((share) => [share.id, share.amountCents]),
		account.receipts.map((receipt) => [
			receipt.id,
			receipt.amountCents,
			receipt.allocations.map((item) => [item.debtId, item.amountCents]),
		]),
	];
	return createHash("sha256").update(JSON.stringify(stored)).digest("hex");
}

function toOpenShares(account: Pick<Account, "shares">): OpenShare[] {
	return openShares(account).map((share) => ({
		debtId: share.id,
		billName: share.name,
		category: share.category,
		dueAt: share.dueAt,
		remainingCents: share.remainingCents,
	}));
}

// The proposal for a bank receipt that is not credited yet, so the whole
// transfer is available to allocate.
export function suggestBankReceipt(
	account: Pick<AccountPayments, "bills">,
	bank: { amountCents: number; receivedAt: number; message: string },
): Suggestion | null {
	return suggestAllocations({
		amountCents: bank.amountCents,
		receivedAt: bank.receivedAt,
		rentOnly: isRentReference(bank.message),
		shares: toOpenShares({ shares: account.bills }),
	});
}
