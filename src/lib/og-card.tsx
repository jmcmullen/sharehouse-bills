type OgCardProps = {
	backgroundColor: string;
	fontFamily?: string;
	primaryValue: string;
	secondaryColor: string;
	secondaryValue?: string | null;
	tertiaryColor?: string;
	tertiaryValue?: string | null;
	title: string;
	titleColor: string;
};

type OgTextSlot = {
	fontSize: number;
	fontWeight: number;
	letterSpacing: number;
	lengthStep: number;
	maxLength: number;
	minFontSize: number;
};

function getFittedFontSize(value: string, slot: OgTextSlot) {
	if (value.length <= slot.maxLength) {
		return slot.fontSize;
	}

	const steps = Math.ceil((value.length - slot.maxLength) / slot.lengthStep);
	return Math.max(slot.minFontSize, slot.fontSize - steps * 4);
}

function getTextStyle(value: string, slot: OgTextSlot) {
	const fontSize = getFittedFontSize(value, slot);
	const letterSpacing = Number(
		(slot.letterSpacing * (fontSize / slot.fontSize)).toFixed(2),
	);

	return {
		fontSize,
		fontWeight: slot.fontWeight,
		letterSpacing,
		lineHeight: 1,
	};
}

const titleSlot = {
	fontSize: 58,
	fontWeight: 650,
	letterSpacing: -1.2,
	lengthStep: 5,
	maxLength: 24,
	minFontSize: 46,
} satisfies OgTextSlot;

const primarySlot = {
	fontSize: 164,
	fontWeight: 750,
	letterSpacing: -5.2,
	lengthStep: 2,
	maxLength: 12,
	minFontSize: 118,
} satisfies OgTextSlot;

const secondarySlot = {
	fontSize: 64,
	fontWeight: 640,
	letterSpacing: -1.6,
	lengthStep: 4,
	maxLength: 20,
	minFontSize: 48,
} satisfies OgTextSlot;

const tertiarySlot = {
	fontSize: 52,
	fontWeight: 540,
	letterSpacing: -0.8,
	lengthStep: 6,
	maxLength: 28,
	minFontSize: 40,
} satisfies OgTextSlot;

export function OgCard({
	backgroundColor,
	fontFamily,
	primaryValue,
	secondaryColor,
	secondaryValue,
	tertiaryColor,
	tertiaryValue,
	title,
	titleColor,
}: OgCardProps) {
	return (
		<div
			style={{
				background: backgroundColor,
				boxSizing: "border-box",
				display: "flex",
				flexDirection: "column",
				height: "100%",
				padding: "88px 96px",
				width: "100%",
			}}
		>
			<div
				style={{
					...getTextStyle(title, titleSlot),
					color: secondaryColor,
					fontFamily: fontFamily ?? "sans-serif",
					maxWidth: "100%",
				}}
			>
				{title}
			</div>
			<div
				style={{
					...getTextStyle(primaryValue, primarySlot),
					color: titleColor,
					fontFamily: fontFamily ?? "sans-serif",
					marginTop: 48,
					maxWidth: "100%",
				}}
			>
				{primaryValue}
			</div>
			{secondaryValue ? (
				<div
					style={{
						...getTextStyle(secondaryValue, secondarySlot),
						color: secondaryColor,
						fontFamily: fontFamily ?? "sans-serif",
						marginTop: 54,
						maxWidth: "100%",
					}}
				>
					{secondaryValue}
				</div>
			) : null}
			{tertiaryValue ? (
				<div
					style={{
						...getTextStyle(tertiaryValue, tertiarySlot),
						color: tertiaryColor ?? secondaryColor,
						fontFamily: fontFamily ?? "sans-serif",
						marginTop: secondaryValue ? 28 : 54,
						maxWidth: "100%",
					}}
				>
					{tertiaryValue}
				</div>
			) : null}
		</div>
	);
}
