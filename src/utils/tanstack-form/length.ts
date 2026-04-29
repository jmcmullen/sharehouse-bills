import type { FieldValidator } from "./types";

export function minLength(
	length: number,
	message?: string,
): FieldValidator<string> {
	return {
		onChange: ({ value }) => {
			if (!value) return undefined;
			if (value.length < length) {
				return message || `Must be at least ${length} characters`;
			}
			return undefined;
		},
	};
}

export function maxLength(
	length: number,
	message?: string,
): FieldValidator<string> {
	return {
		onChange: ({ value }) => {
			if (!value) return undefined;
			if (value.length > length) {
				return message || `Must be at most ${length} characters`;
			}
			return undefined;
		},
	};
}
