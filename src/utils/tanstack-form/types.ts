type ValidatorResult = string | undefined;

export type FieldValidator<TValue> = {
	onChange: ({ value }: { value: TValue }) => ValidatorResult;
};
