export function formatCurrency(amount: number) {
	return new Intl.NumberFormat("en-AU", {
		style: "currency",
		currency: "AUD",
	}).format(amount);
}

export function escapeXml(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

export function truncate(value: string, maxLength: number) {
	if (value.length <= maxLength) {
		return value;
	}

	return `${value.slice(0, maxLength - 1)}…`;
}

export function formatStackGroupLabel(stackGroup: string) {
	return stackGroup
		.split(/[\s_-]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

type OgTextSlot = {
	fontSize: number;
	minFontSize: number;
	fontStep: number;
	maxLength: number;
	lengthStep: number;
	fontWeight: number;
	letterSpacing: number;
	x: number;
	y: number;
	fill: string;
};

function getFittedFontSize(value: string, slot: OgTextSlot) {
	if (value.length <= slot.maxLength) {
		return slot.fontSize;
	}

	const steps = Math.ceil((value.length - slot.maxLength) / slot.lengthStep);
	return Math.max(slot.minFontSize, slot.fontSize - steps * slot.fontStep);
}

function renderOgText(value: string, slot: OgTextSlot) {
	const fontSize = getFittedFontSize(value, slot);
	const letterSpacing = Number(
		(slot.letterSpacing * (fontSize / slot.fontSize)).toFixed(2),
	);

	return `<text x="${slot.x}" y="${slot.y}" fill="${slot.fill}" font-size="${fontSize}" font-weight="${slot.fontWeight}" font-family="'Plus Jakarta Sans', Inter, Arial, sans-serif" letter-spacing="${letterSpacing}" dominant-baseline="hanging">${escapeXml(value)}</text>`;
}

export function buildOgCardSvg(input: {
	backgroundColor: string;
	titleColor: string;
	secondaryColor: string;
	tertiaryColor?: string;
	title: string;
	primaryValue: string;
	secondaryValue?: string | null;
	tertiaryValue?: string | null;
}) {
	const titleSlot = {
		fontSize: 58,
		minFontSize: 46,
		fontStep: 4,
		maxLength: 24,
		lengthStep: 5,
		fontWeight: 650,
		letterSpacing: -1.2,
		x: 96,
		y: 88,
		fill: input.secondaryColor,
	} satisfies OgTextSlot;
	const primarySlot = {
		fontSize: 164,
		minFontSize: 118,
		fontStep: 10,
		maxLength: 12,
		lengthStep: 2,
		fontWeight: 750,
		letterSpacing: -5.2,
		x: 96,
		y: 188,
		fill: input.titleColor,
	} satisfies OgTextSlot;
	const secondarySlot = {
		fontSize: 64,
		minFontSize: 48,
		fontStep: 4,
		maxLength: 20,
		lengthStep: 4,
		fontWeight: 640,
		letterSpacing: -1.6,
		x: 96,
		y: 392,
		fill: input.secondaryColor,
	} satisfies OgTextSlot;
	const tertiarySlot = {
		fontSize: 52,
		minFontSize: 40,
		fontStep: 4,
		maxLength: 28,
		lengthStep: 6,
		fontWeight: 540,
		letterSpacing: -0.8,
		x: 96,
		y: 484,
		fill: input.tertiaryColor ?? input.secondaryColor,
	} satisfies OgTextSlot;

	return `
<svg width="1200" height="630" viewBox="0 0 1200 630" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="${input.backgroundColor}"/>
  ${renderOgText(input.title, titleSlot)}
  ${renderOgText(input.primaryValue, primarySlot)}
  ${input.secondaryValue ? renderOgText(input.secondaryValue, secondarySlot) : ""}
  ${input.tertiaryValue ? renderOgText(input.tertiaryValue, tertiarySlot) : ""}
</svg>`.trim();
}

export function buildOpenGraphMeta(input: {
	title: string;
	description: string;
	url?: string | null;
	imageUrl?: string | null;
}) {
	return [
		{ property: "og:title", content: input.title },
		{ property: "og:description", content: input.description },
		{ property: "og:type", content: "website" },
		...(input.url ? [{ property: "og:url", content: input.url }] : []),
		...(input.imageUrl
			? [
					{ property: "og:image", content: input.imageUrl },
					{ property: "og:image:type", content: "image/png" },
					{ property: "og:image:width", content: "1200" },
					{ property: "og:image:height", content: "630" },
					{ name: "twitter:card", content: "summary_large_image" },
					{ name: "twitter:title", content: input.title },
					{ name: "twitter:description", content: input.description },
					{ name: "twitter:image", content: input.imageUrl },
				]
			: []),
	];
}
