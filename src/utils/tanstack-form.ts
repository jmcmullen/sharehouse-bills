// Common validators for TanStack Form
export const validators = {
	required: (message = "This field is required") => ({
		onChange: ({ value }: { value: unknown }) => {
			if (!value || (typeof value === "string" && !value.trim())) {
				return message;
			}
			return undefined;
		},
	}),
	email: (message = "Invalid email address") => ({
		onChange: ({ value }: { value: string }) => {
			if (!value) return undefined;
			const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
			if (!emailRegex.test(value)) {
				return message;
			}
			return undefined;
		},
	}),
	number: (min?: number, max?: number) => ({
		onChange: ({ value }: { value: number }) => {
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
	}),
	minLength: (length: number, message?: string) => ({
		onChange: ({ value }: { value: string }) => {
			if (!value) return undefined;
			if (value.length < length) {
				return message || `Must be at least ${length} characters`;
			}
			return undefined;
		},
	}),
	maxLength: (length: number, message?: string) => ({
		onChange: ({ value }: { value: string }) => {
			if (!value) return undefined;
			if (value.length > length) {
				return message || `Must be at most ${length} characters`;
			}
			return undefined;
		},
	}),
};
