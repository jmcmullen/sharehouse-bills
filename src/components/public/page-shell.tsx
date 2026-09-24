import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { SECTION_LABEL_CLASS } from "./section-header";

// The phone-width column every public page sits in. Leaves room at the bottom
// for a sticky footer when the page has one.
export function PublicPage({
	hasFooter,
	children,
}: {
	hasFooter: boolean;
	children: ReactNode;
}) {
	return (
		<div className="min-h-screen bg-background text-foreground">
			<div
				className={cn(
					"mx-auto flex min-h-screen max-w-md flex-col gap-7 px-5 pt-5 sm:min-h-0 sm:gap-8 sm:pt-8",
					hasFooter ? "pb-32 sm:pb-12" : "pb-6 sm:pb-12",
				)}
			>
				{children}
			</div>
		</div>
	);
}

// Housemate name, what the number means, the number, then any badges.
export function AmountHeader({
	name,
	label,
	amount,
	children,
}: {
	name: string;
	label: string;
	amount: string;
	children?: ReactNode;
}) {
	return (
		<header className="flex flex-col gap-3">
			<p className="truncate font-semibold text-[15px] tracking-tight">
				{name}
			</p>
			<div className="flex flex-col gap-1">
				<p className={SECTION_LABEL_CLASS}>{label}</p>
				<h1 className="font-bold text-[3.25rem] tabular-nums leading-[1.02] tracking-[-0.03em]">
					{amount}
				</h1>
			</div>
			{children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
		</header>
	);
}

export function ExpiredLinkPage({
	title,
	body,
}: {
	title: string;
	body: string;
}) {
	return (
		<div className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
			<div className="mx-auto flex max-w-sm flex-col items-center gap-5 text-center">
				<div
					aria-hidden
					className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted font-bold text-2xl text-muted-foreground"
				>
					?
				</div>
				<div className="space-y-2">
					<h1 className="font-bold text-2xl tracking-tight">{title}</h1>
					<p className="text-[14px] text-muted-foreground leading-6">{body}</p>
				</div>
				<Button asChild variant="outline" className="h-11 font-medium">
					<a href="/">Head home</a>
				</Button>
			</div>
		</div>
	);
}
