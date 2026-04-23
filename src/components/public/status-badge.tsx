import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type * as React from "react";

type PublicStatusTone = "danger" | "info" | "neutral" | "success" | "warning";

const toneClasses: Record<PublicStatusTone, string> = {
	danger:
		"border-destructive/20 bg-destructive/10 text-destructive dark:border-destructive/30 dark:bg-destructive/15",
	info: "border-primary/20 bg-primary/10 text-primary dark:bg-primary/15",
	neutral: "border-border bg-muted text-muted-foreground",
	success: "border-success/25 bg-success-muted text-success-muted-foreground",
	warning: "border-warning/25 bg-warning-muted text-warning-muted-foreground",
};

type PublicStatusBadgeProps = React.ComponentProps<"span"> & {
	tone: PublicStatusTone;
};

export function PublicStatusBadge({
	tone,
	className,
	...props
}: PublicStatusBadgeProps) {
	return (
		<Badge
			variant="outline"
			className={cn(
				"rounded-full px-2.5 py-1 font-semibold text-[11.5px] tracking-tight",
				toneClasses[tone],
				className,
			)}
			{...props}
		/>
	);
}
