const aud = new Intl.NumberFormat("en-AU", {
	style: "currency",
	currency: "AUD",
});

// Money is stored and computed in integer cents; dollars exist only on screen.
export function formatCents(cents: number): string {
	return aud.format(cents / 100);
}

// Dollars typed into a form, as whole cents. Null when the text is not money.
export function parseCents(text: string): number | null {
	const value = Number(text.trim().replace(/^\$/, ""));
	if (!text.trim() || !Number.isFinite(value)) return null;
	return Math.round((value + Number.EPSILON) * 100);
}

// Cents as plain two-decimal text ("12.50"), for form inputs and stored keys.
export function formatDecimal(cents: number): string {
	const sign = cents < 0 ? "-" : "";
	const whole = Math.abs(cents);
	return `${sign}${Math.floor(whole / 100)}.${String(whole % 100).padStart(2, "0")}`;
}
