const SETTLED_TOLERANCE = 0.005;

// Share of a total that has been paid, by amount. Rounds down so a bill that
// is a few cents short never reads as 100% until it is actually settled.
export function paidPercentage(settled: number, total: number): number {
	if (total <= 0) return 100;
	if (settled >= total - SETTLED_TOLERANCE) return 100;
	return Math.max(0, Math.min(99, Math.floor((settled / total) * 100)));
}
