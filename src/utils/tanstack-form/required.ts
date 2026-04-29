import type { FieldValidator } from "./types";

export function required(
	message = "This field is required",
): FieldValidator<unknown> {
	return {
		onChange: ({ value }) => {
			if (!value || (typeof value === "string" && !value.trim())) {
				return message;
			}
			return undefined;
		},
	};
}
