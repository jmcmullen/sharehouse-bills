import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatCents } from "@/lib/money";
import type { BillListShare } from "./types";

interface DebtTooltipProps {
	shares: BillListShare[];
	type: "paid" | "owed";
	children: React.ReactNode;
}

export function DebtTooltip({ shares, type, children }: DebtTooltipProps) {
	const isPaid = type === "paid";
	const settled = shares.filter((share) => share.remainingCents === 0).length;
	const listed = shares.filter((share) =>
		isPaid ? share.paidCents > 0 : share.remainingCents > 0,
	);
	const title = isPaid
		? `Paid (${settled}/${shares.length})`
		: `Owed (${shares.length - settled}/${shares.length})`;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div className="cursor-help">{children}</div>
			</TooltipTrigger>
			<TooltipContent>
				<div className="space-y-1">
					<p className="font-semibold">{title}</p>
					{listed.map((share) => (
						<div key={share.id} className="flex justify-between gap-4 text-sm">
							<span>{share.housemateName}</span>
							<span className="font-mono">
								{formatCents(isPaid ? share.paidCents : share.remainingCents)}
							</span>
						</div>
					))}
				</div>
			</TooltipContent>
		</Tooltip>
	);
}
