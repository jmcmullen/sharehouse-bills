import { email } from "./tanstack-form/email";
import { maxLength, minLength } from "./tanstack-form/length";
import { number } from "./tanstack-form/number";
import { required } from "./tanstack-form/required";

export const validators = {
	required,
	email,
	number,
	minLength,
	maxLength,
};
