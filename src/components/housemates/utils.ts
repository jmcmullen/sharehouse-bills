export function formatCurrency(amount: number): string {
	return new Intl.NumberFormat("en-AU", {
		style: "currency",
		currency: "AUD",
	}).format(amount);
}

export function formatDate(date: Date | string): string {
	const dateObj = typeof date === "string" ? new Date(date) : date;
	return dateObj.toLocaleDateString("en-AU", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

export function validateHousemateForm(data: { name: string; email?: string }):
	| string
	| null {
	if (!data.name?.trim()) {
		return "Name is required";
	}
	if (data.email && !isValidEmail(data.email)) {
		return "Please enter a valid email address";
	}
	return null;
}

function isValidEmail(email: string): boolean {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
}

export function sanitizeFormData(data: {
	name: string;
	email: string;
	bankAlias: string;
}) {
	return {
		name: data.name.trim(),
		email: data.email.trim() || undefined,
		bankAlias: data.bankAlias.trim() || undefined,
	};
}
