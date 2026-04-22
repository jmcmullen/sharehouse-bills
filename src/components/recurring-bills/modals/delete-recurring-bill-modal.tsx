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

interface DeleteRecurringBillModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	isDeleting: boolean;
	templateName: string | null;
}

export function DeleteRecurringBillModal({
	open,
	onOpenChange,
	onConfirm,
	isDeleting,
	templateName,
}: DeleteRecurringBillModalProps) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete Recurring Bill</AlertDialogTitle>
					<AlertDialogDescription>
						Delete {templateName ? `"${templateName}"` : "this recurring bill"}?
						Future generated bills will stop, but existing bills will remain.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						className="bg-red-600 hover:bg-red-700"
						onClick={onConfirm}
						disabled={isDeleting}
					>
						{isDeleting ? "Deleting..." : "Delete"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
