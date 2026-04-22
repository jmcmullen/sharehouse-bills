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

export function validateHousemateForm(data: {
	name: string;
	email?: string;
	whatsappNumber?: string;
}): string | null {
	if (!data.name?.trim()) {
		return "Name is required";
	}
	if (data.email && !isValidEmail(data.email)) {
		return "Please enter a valid email address";
	}
	if (data.whatsappNumber && !isValidWhatsappNumber(data.whatsappNumber)) {
		return "WhatsApp number must be in international format, for example +61400111222";
	}
	return null;
}

function isValidEmail(email: string): boolean {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
}

function isValidWhatsappNumber(value: string): boolean {
	return /^\+\d{8,15}$/.test(value.trim());
}

export function sanitizeFormData(data: {
	name: string;
	email: string;
	whatsappNumber: string;
	bankAlias: string;
}) {
	return {
		name: data.name.trim(),
		email: data.email.trim() || undefined,
		whatsappNumber: data.whatsappNumber.trim() || undefined,
		bankAlias: data.bankAlias.trim() || undefined,
	};
}
