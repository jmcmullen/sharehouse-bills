import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { GroupedBill } from "../types";

interface ViewBillPdfModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	bill: GroupedBill | null;
}

export function ViewBillPdfModal({
	open,
	onOpenChange,
	bill,
}: ViewBillPdfModalProps) {
	if (!bill?.bill.pdfUrl || !bill.bill.pdfSha256) {
		return null;
	}

	const pdfViewerUrl = `/api/bill-pdfs/${bill.bill.pdfSha256}`;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="h-[90vh] max-w-[calc(100%-2rem)] overflow-hidden p-0 sm:max-w-6xl">
				<div className="flex h-full flex-col">
					<div className="border-b px-6 py-4">
						<DialogHeader className="gap-3">
							<DialogTitle>{bill.bill.billerName} PDF</DialogTitle>
							<DialogDescription>
								{bill.bill.sourceFilename || "Original bill PDF"}
							</DialogDescription>
						</DialogHeader>
					</div>
					<iframe
						title={`${bill.bill.billerName} PDF`}
						src={pdfViewerUrl}
						className="min-h-0 flex-1"
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
}
