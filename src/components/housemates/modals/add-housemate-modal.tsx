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

interface AddHousemateModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	formData: HousemateFormData;
	onFormDataChange: (data: HousemateFormData) => void;
	onSubmit: () => void;
	isLoading: boolean;
}

export function AddHousemateModal({
	open,
	onOpenChange,
	formData,
	onFormDataChange,
	onSubmit,
	isLoading,
}: AddHousemateModalProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add New Housemate</DialogTitle>
					<DialogDescription>
						Add a new member to your household for bill tracking
					</DialogDescription>
				</DialogHeader>
				<div className="py-4">
					<HousemateFormFields
						data={formData}
						onChange={onFormDataChange}
						idPrefix="add-"
					/>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={onSubmit} disabled={isLoading}>
						{isLoading ? "Adding..." : "Add Housemate"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
