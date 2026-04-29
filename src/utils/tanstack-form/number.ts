import type { FieldValidator } from "./types";

export function number(min?: number, max?: number): FieldValidator<number> {
	return {
		onChange: ({ value }) => {
			if (typeof value !== "number" || Number.isNaN(value)) {
				return "Must be a number";
			}
			if (min !== undefined && value < min) {
				return `Must be at least ${min}`;
			}
			if (max !== undefined && value > max) {
				return `Must be at most ${max}`;
			}
			return undefined;
		},
	};
}
