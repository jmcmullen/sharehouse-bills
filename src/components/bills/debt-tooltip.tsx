import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { DebtSummary } from "./types";
import { formatCurrency } from "./utils";

interface DebtTooltipProps {
	debtSummary: DebtSummary;
	type: "paid" | "owed";
	children: React.ReactNode;
}

export function DebtTooltip({ debtSummary, type, children }: DebtTooltipProps) {
	const isPaid = type === "paid";
	const debts = isPaid
		? debtSummary.debts.filter((d) => (d.debt?.amountPaid || 0) > 0)
		: debtSummary.debts.filter(
				(d) => (d.debt ? d.debt.amountOwed - d.debt.amountPaid : 0) > 0,
			);

	const title = isPaid
		? `Paid (${debtSummary.paid}/${debtSummary.total})`
		: `Owed (${debtSummary.total - debtSummary.paid}/${debtSummary.total})`;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div className="cursor-help">{children}</div>
			</TooltipTrigger>
			<TooltipContent>
				<div className="space-y-1">
					<p className="font-semibold">{title}</p>
					{debts.map(({ debt, housemate }) => (
						<div key={debt.id} className="flex justify-between gap-4 text-sm">
							<span>{housemate.name}</span>
							<span className="font-mono">
								{formatCurrency(
									isPaid
										? debt.amountPaid
										: Math.max(0, debt.amountOwed - debt.amountPaid),
								)}
							</span>
						</div>
					))}
				</div>
			</TooltipContent>
		</Tooltip>
	);
}
