import { ledgerMoney, ledgerTime } from "./statement";

export function ManualPaymentMatches(props: {
	payments: Array<{
		key: string;
		amountCents: number;
		effectiveAt: number;
		description: string;
		bills: string;
	}>;
	selected: string[];
	bankAmountCents: number;
	busy: boolean;
	onChange: (keys: string[]) => void;
}) {
	const total = props.payments
		.filter((item) => props.selected.includes(item.key))
		.reduce((sum, item) => sum - item.amountCents, 0);
	return (
		<fieldset
			className="space-y-3 rounded-lg border border-amber-500/40 p-3 text-sm"
			disabled={props.busy}
		>
			<legend className="px-1 font-medium">
				Is this money already recorded?
			</legend>
			<p>
				Select the recorded payments covered by this transfer. Their total must
				match. Matching confirms existing money and adds no extra credit.
			</p>
			<div className="max-h-64 space-y-3 overflow-y-auto">
				{props.payments.map((item) => (
					<label
						key={item.key}
						className="flex items-start gap-3 rounded-md border p-3"
					>
						<input
							className="mt-1"
							type="checkbox"
							checked={props.selected.includes(item.key)}
							onChange={(event) =>
								props.onChange(
									event.target.checked
										? [...props.selected, item.key]
										: props.selected.filter((key) => key !== item.key),
								)
							}
						/>
						<span>
							<span className="font-medium">
								{ledgerMoney(-item.amountCents)} · {item.description}
							</span>
							<span className="mt-1 block text-muted-foreground text-xs">
								Recorded {ledgerTime(item.effectiveAt)}
							</span>
							<span className="mt-1 block text-xs">
								{item.bills || "No bill allocated yet"}
							</span>
						</span>
					</label>
				))}
			</div>
			<p className="font-medium">
				Selected {ledgerMoney(total)} of {ledgerMoney(props.bankAmountCents)}
			</p>
			{props.selected.length === 0 && (
				<p className="text-muted-foreground">
					For a separate payment, leave these unchecked and explain why below.
				</p>
			)}
		</fieldset>
	);
}
