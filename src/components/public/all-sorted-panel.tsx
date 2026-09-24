import { formatCurrency } from "@/lib/share-preview";
import confetti from "canvas-confetti";
import { useEffect, useRef } from "react";

const CELEBRATION_COLORS = ["#c87553", "#4fb377", "#dda94a", "#f0bfa2"];

function firePopper(origin: { x: number; y: number }) {
	if (typeof window === "undefined") return;
	const prefersReducedMotion = window.matchMedia(
		"(prefers-reduced-motion: reduce)",
	).matches;
	if (prefersReducedMotion) return;

	const base = {
		particleCount: 55,
		startVelocity: 42,
		spread: 55,
		ticks: 200,
		colors: CELEBRATION_COLORS,
		scalar: 0.9,
		disableForReducedMotion: true,
	};
	confetti({ ...base, origin, angle: 65 });
	confetti({ ...base, origin, angle: 115 });
	window.setTimeout(() => {
		confetti({
			particleCount: 30,
			spread: 110,
			startVelocity: 22,
			origin,
			colors: CELEBRATION_COLORS,
			scalar: 0.7,
			ticks: 160,
			gravity: 0.9,
			disableForReducedMotion: true,
		});
	}, 240);
}

function getAnchorOrigin(element: HTMLElement | null) {
	if (typeof window === "undefined") return { x: 0.5, y: 0.35 };
	const rect = element?.getBoundingClientRect();
	if (!rect) return { x: 0.5, y: 0.35 };
	return {
		x: (rect.left + rect.width / 2) / window.innerWidth,
		y: (rect.top + rect.height / 2) / window.innerHeight,
	};
}

function useCelebration(active: boolean) {
	const anchorRef = useRef<HTMLButtonElement | null>(null);
	const firedRef = useRef(false);

	useEffect(() => {
		if (!active || firedRef.current) return;
		firedRef.current = true;
		firePopper(getAnchorOrigin(anchorRef.current));
	}, [active]);

	function replay() {
		firePopper(getAnchorOrigin(anchorRef.current));
	}

	return { anchorRef, replay };
}

export function AllSortedPanel({
	housemateFirstName,
	recentlySettled,
}: {
	housemateFirstName: string;
	recentlySettled: {
		amount: number;
		billCount: number;
	};
}) {
	const { anchorRef, replay } = useCelebration(true);
	const hasRecap = recentlySettled.billCount > 0;
	const isStreak = recentlySettled.billCount >= 3;

	return (
		<section className="motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 flex flex-col gap-2 motion-safe:animate-in motion-safe:duration-500">
			<h2 className="font-semibold text-xl tracking-tight">
				Thanks, {housemateFirstName}{" "}
				<button
					ref={anchorRef}
					type="button"
					onClick={replay}
					aria-label="Celebrate again"
					className="motion-safe:hover:-rotate-12 inline-block cursor-pointer select-none rounded-sm border-0 bg-transparent p-0 align-middle ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-safe:transition-transform motion-safe:duration-300 motion-safe:active:scale-95"
				>
					🎉
				</button>
			</h2>
			{hasRecap ? (
				<p className="text-muted-foreground text-sm leading-6">
					You&apos;ve sorted{" "}
					<span className="font-semibold text-success tabular-nums">
						{formatCurrency(recentlySettled.amount)}
					</span>{" "}
					across {recentlySettled.billCount}{" "}
					{recentlySettled.billCount === 1 ? "bill" : "bills"} in the last 30
					days
					{isStreak ? " — absolute legend." : "."}
				</p>
			) : (
				<p className="text-muted-foreground text-sm leading-6">
					Your tab&apos;s empty.
				</p>
			)}
		</section>
	);
}
