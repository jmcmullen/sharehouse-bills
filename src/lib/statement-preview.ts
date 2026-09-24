import { formatCurrency, truncate } from "./share-preview";

interface StatementPreviewInput {
	name: string;
	headline: { label: string; amount: number };
	monthCount: number;
}

const settled = {
	backgroundColor: "#0d1f14",
	secondaryColor: "#b9e4c9",
	tertiaryColor: "#8fc6a5",
	titleColor: "#f0fbf4",
};
const owing = {
	backgroundColor: "#1f221b",
	secondaryColor: "#c7d1be",
	tertiaryColor: "#a9b3a0",
	titleColor: "#f4f7ef",
};

function firstName(name: string) {
	return name.trim().split(/\s+/)[0] || "your";
}

function monthsLine(count: number) {
	return count === 1
		? "1 month of bills and payments"
		: `${count} months of bills and payments`;
}

// Title, description and card text for a housemate statement link, shared by
// the page head and its OG image so the two never disagree.
export function statementPreview(input: StatementPreviewInput) {
	const { label, amount } = input.headline;
	const hasAmount = amount > 0.009;
	const figure = hasAmount ? formatCurrency(amount) : label;
	const summary = hasAmount ? `${label} ${formatCurrency(amount)}` : label;
	const title = `${firstName(input.name)}'s statement`;
	return {
		title,
		description: `${summary}. Every bill and payment, month by month.`,
		card: {
			...(label === "You owe" ? owing : settled),
			title: truncate(title, 42),
			primaryValue: figure,
			secondaryValue: hasAmount ? label : "Statement",
			tertiaryValue: monthsLine(input.monthCount),
		},
	};
}
