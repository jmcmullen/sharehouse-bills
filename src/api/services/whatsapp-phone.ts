const NON_DIGIT_PATTERN = /\D/g;

function toDigitString(value: string) {
	return value.replace(NON_DIGIT_PATTERN, "");
}

export function normalizeWhatsappNumber(value: string | null | undefined) {
	if (!value) {
		return null;
	}

	const trimmedValue = value.trim();
	if (!trimmedValue) {
		return null;
	}

	if (trimmedValue.startsWith("+")) {
		const digits = toDigitString(trimmedValue);
		return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
	}

	if (trimmedValue.startsWith("00")) {
		const digits = toDigitString(trimmedValue.slice(2));
		return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
	}

	return null;
}

export function whatsappNumberToChatId(value: string | null | undefined) {
	const normalizedNumber = normalizeWhatsappNumber(value);
	if (!normalizedNumber) {
		return null;
	}

	return `${normalizedNumber.slice(1)}@c.us`;
}

export function whatsappChatIdToNumber(chatId: string | null | undefined) {
	if (!chatId) {
		return null;
	}

	const match = /^(\d+)@(?:c\.us|lid)$/.exec(chatId.trim());
	if (!match) {
		return null;
	}

	return normalizeWhatsappNumber(`+${match[1]}`);
}
