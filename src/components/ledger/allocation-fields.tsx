import type { BillPaymentView } from "../../api/services/ledger/account-payments";
import { Input } from "../ui/input";
import { ledgerDate, ledgerMoney } from "./statement";

export type Amounts = Record<string, string>;

export function allocationsFrom(
	amounts: Amounts,
): Array<{ debtId: string; amountCents: number }> {
	return Object.entries(amounts)
		.filter(([, amount]) => Number(amount) > 0)
		.map(([debtId, amount]) => ({
			debtId,
			amountCents: Math.round(Number(amount) * 100),
		}));
}

export function amountsFrom(
	allocations: Array<{ debtId: string; amountCents: number }>,
): Amounts {
	return Object.fromEntries(
		allocations.map((item) => [
			item.debtId,
			(item.amountCents / 100).toFixed(2),
		]),
	);
}

// One input per open bill share; bills already covered by this receipt stay
// visible so their amounts can be changed or cleared.
export function BillAllocationFields({
	bills,
	rentOnly,
	kept,
	amounts,
	busy,
	onChange,
}: {
	bills: BillPaymentView[];
	rentOnly: boolean;
	kept: string[];
	amounts: Amounts;
	busy: boolean;
	onChange: (amounts: Amounts) => void;
}) {
	const visible = bills.filter(
		(bill) =>
			(!rentOnly || /rent/i.test(bill.category)) &&
			(bill.remainingCents > 0 || kept.includes(bill.id)),
	);
	if (!visible.length)
		return (
			<p className="text-muted-foreground text-sm">
				No open bill shares. The money stays as credit.
			</p>
		);
	return (
		<div className="space-y-4">
			{visible.map((bill) => (
				<label
					htmlFor={`allocation-${bill.id}`}
					key={bill.id}
					className="flex items-center justify-between gap-4 border-b pb-3"
				>
					<span className="text-sm">
						{bill.name}
						<span className="mt-1 block text-muted-foreground text-xs">
							{bill.dueAt ? ledgerDate(bill.dueAt) : "No due date"} · Share{" "}
							{ledgerMoney(bill.amountCents)}
						</span>
					</span>
					<Input
						id={`allocation-${bill.id}`}
						className="w-28"
						type="number"
						min="0"
						step="0.01"
						max={bill.amountCents / 100}
						aria-label={`Allocate to ${bill.name} ${bill.dueAt ? ledgerDate(bill.dueAt) : bill.id}`}
						value={amounts[bill.id] ?? ""}
						placeholder="0.00"
						disabled={busy}
						onChange={(event) =>
							onChange({ ...amounts, [bill.id]: event.target.value })
						}
					/>
				</label>
			))}
		</div>
	);
}
