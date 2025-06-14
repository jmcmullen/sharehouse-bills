import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { HousemateFormFields } from "../housemate-form-fields";
import type { HousemateFormData } from "../types";

interface EditHousemateModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	formData: HousemateFormData;
	onFormDataChange: (data: HousemateFormData) => void;
	onSubmit: () => void;
	isLoading: boolean;
}

export function EditHousemateModal({
	open,
	onOpenChange,
	formData,
	onFormDataChange,
	onSubmit,
	isLoading,
}: EditHousemateModalProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit Housemate</DialogTitle>
					<DialogDescription>Update housemate information</DialogDescription>
				</DialogHeader>
				<div className="py-4">
					<HousemateFormFields
						data={formData}
						onChange={onFormDataChange}
						idPrefix="edit-"
					/>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={onSubmit} disabled={isLoading}>
						{isLoading ? "Updating..." : "Update Housemate"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
