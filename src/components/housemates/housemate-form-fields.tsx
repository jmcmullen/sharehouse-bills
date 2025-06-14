import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HousemateFormData } from "./types";

interface HousemateFormFieldsProps {
	data: HousemateFormData;
	onChange: (data: HousemateFormData) => void;
	idPrefix?: string;
}

export function HousemateFormFields({
	data,
	onChange,
	idPrefix = "",
}: HousemateFormFieldsProps) {
	const updateField = (field: keyof HousemateFormData, value: string) => {
		onChange({ ...data, [field]: value });
	};

	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<Label htmlFor={`${idPrefix}name`}>Name *</Label>
				<Input
					id={`${idPrefix}name`}
					value={data.name}
					onChange={(e) => updateField("name", e.target.value)}
					placeholder="Enter full name"
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor={`${idPrefix}email`}>Email</Label>
				<Input
					id={`${idPrefix}email`}
					type="email"
					value={data.email}
					onChange={(e) => updateField("email", e.target.value)}
					placeholder="Enter email address"
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor={`${idPrefix}bankAlias`}>Bank Alias</Label>
				<Input
					id={`${idPrefix}bankAlias`}
					value={data.bankAlias}
					onChange={(e) => updateField("bankAlias", e.target.value)}
					placeholder="Name used in bank transfers"
				/>
			</div>
		</div>
	);
}
