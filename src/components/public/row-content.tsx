import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

// One line item on the public pages: name and detail on the left, amount or
// action on the right.
export function RowContent({
	primary,
	secondary,
	aside,
	className,
}: {
	primary: ReactNode;
	secondary?: ReactNode;
	aside: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("flex items-start justify-between gap-4", className)}>
			<div className="min-w-0 flex-1">
				<div className="truncate font-semibold text-[15px] leading-tight tracking-[-0.005em]">
					{primary}
				</div>
				{secondary ? (
					<p className="mt-1 text-[12.5px] text-muted-foreground leading-tight">
						{secondary}
					</p>
				) : null}
			</div>
			<div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
				{aside}
			</div>
		</div>
	);
}
