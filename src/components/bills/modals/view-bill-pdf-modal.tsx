import { BillPdfStorageService } from "@/api/services/bill-pdf-storage";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { BillListItem } from "../types";

interface ViewBillPdfModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	bill: BillListItem | null;
}

export function ViewBillPdfModal({
	open,
	onOpenChange,
	bill,
}: ViewBillPdfModalProps) {
	if (!bill?.pdfUrl || !bill.pdfSha256) {
		return null;
	}

	const pdfViewerUrl = BillPdfStorageService.getPdfUrl(bill.pdfSha256);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="h-[90vh] max-w-[calc(100%-2rem)] overflow-hidden p-0 sm:max-w-6xl">
				<div className="flex h-full flex-col">
					<div className="border-b px-6 py-4">
						<DialogHeader className="gap-3">
							<DialogTitle>{bill.billerName} PDF</DialogTitle>
							<DialogDescription>
								{bill.sourceFilename || "Original bill PDF"}
							</DialogDescription>
						</DialogHeader>
					</div>
					<iframe
						title={`${bill.billerName} PDF`}
						src={pdfViewerUrl}
						className="min-h-0 flex-1"
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
}
