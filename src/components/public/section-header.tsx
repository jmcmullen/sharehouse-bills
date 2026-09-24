import type { ReactNode } from "react";

export const SECTION_LABEL_CLASS =
	"font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.12em]";

// The small uppercase label above a list, with an optional total on the right.
export function SectionHeader({
	label,
	aside,
}: {
	label: string;
	aside?: ReactNode;
}) {
	return (
		<header className="flex items-center justify-between gap-3 pb-3">
			<h2 className={SECTION_LABEL_CLASS}>{label}</h2>
			{aside ? (
				<p className="shrink-0 font-medium text-[12px] text-muted-foreground tabular-nums">
					{aside}
				</p>
			) : null}
		</header>
	);
}
