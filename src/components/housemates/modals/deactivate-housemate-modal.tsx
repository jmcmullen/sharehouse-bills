import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Housemate } from "../types";

interface DeactivateHousemateModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	housemate: Housemate | null;
	onConfirm: () => void;
	isLoading: boolean;
}

export function DeactivateHousemateModal({
	open,
	onOpenChange,
	housemate,
	onConfirm,
	isLoading,
}: DeactivateHousemateModalProps) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Deactivate Housemate</AlertDialogTitle>
					<AlertDialogDescription>
						Are you sure you want to deactivate {housemate?.name}? They will no
						longer be included in new bills, but their payment history will be
						preserved.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						className="bg-red-600 hover:bg-red-700"
						onClick={onConfirm}
						disabled={isLoading}
					>
						{isLoading ? "Deactivating..." : "Deactivate"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
