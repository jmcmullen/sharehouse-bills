import type { FieldValidator } from "./types";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function email(
	message = "Invalid email address",
): FieldValidator<string> {
	return {
		onChange: ({ value }) => {
			if (!value) return undefined;
			if (!emailRegex.test(value)) {
				return message;
			}
			return undefined;
		},
	};
}
