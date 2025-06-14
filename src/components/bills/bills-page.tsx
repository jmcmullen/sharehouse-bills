import { Button } from "@/components/ui/button";
import { IconPlus } from "@tabler/icons-react";
import { useLoaderData, useRouter } from "@tanstack/react-router";
import { useTransition } from "react";
import { toast } from "sonner";
import {
	deleteBillAction,
	markDebtPaidAction,
	uploadBillAction,
} from "./actions";
import { BillsTable } from "./bills-table";
import { useBillModals } from "./hooks/use-bill-modals";
import { useFileUpload } from "./hooks/use-file-upload";
import { usePagination } from "./hooks/use-pagination";
import { AddBillModal } from "./modals/add-bill-modal";
import { DeleteBillModal } from "./modals/delete-bill-modal";
import { MarkPaidModal } from "./modals/mark-paid-modal";
import { SummaryCards } from "./summary-cards";
import { calculateSummary, groupBillsByBillId } from "./utils";

export function BillsPage() {
	const { billsData } = useLoaderData({ from: "/bills" });
	const router = useRouter();
	const [isPending, startTransition] = useTransition();

	const {
		deleteModalOpen,
		billToDelete,
		openDeleteModal,
		closeDeleteModal,
		markPaidModalOpen,
		billToMarkPaid,
		openMarkPaidModal,
		closeMarkPaidModal,
		addBillModalOpen,
		openAddBillModal,
		closeAddBillModal,
	} = useBillModals();

	const { selectedFile, handleFileSelect, resetFile } = useFileUpload();

	const summaryData = calculateSummary(billsData);
	const groupedBills = groupBillsByBillId(billsData);
	const bills = Object.values(groupedBills);

	const {
		currentPage,
		totalPages,
		startIndex,
		endIndex,
		paginatedItems: paginatedBills,
		goToPrevious,
		goToNext,
	} = usePagination(bills);

	const handleDeleteConfirm = () => {
		if (billToDelete) {
			startTransition(async () => {
				try {
					await deleteBillAction(billToDelete);
					toast.success("Bill deleted successfully");
					router.invalidate();
				} catch (error) {
					toast.error("Failed to delete bill", {
						description:
							error instanceof Error ? error.message : "Unknown error",
					});
				}
				closeDeleteModal();
			});
		}
	};

	const handleMarkPaidConfirm = (
		payments: Array<{ debtId: number; amountPaid: number }>,
	) => {
		startTransition(async () => {
			try {
				await markDebtPaidAction({ payments });
				toast.success("Payments updated successfully");
				router.invalidate();
			} catch (error) {
				toast.error("Failed to update payments", {
					description: error instanceof Error ? error.message : "Unknown error",
				});
			}
			closeMarkPaidModal();
		});
	};

	const handleUploadBill = async (): Promise<boolean> => {
		if (!selectedFile) {
			toast.error("No file selected");
			return false;
		}

		const formData = new FormData();
		formData.append("attachment1", selectedFile);
		formData.append("from", "manual@upload.com");
		formData.append("subject", "Manual Bill Upload");
		formData.append("attachments", "1");

		return new Promise((resolve) => {
			startTransition(async () => {
				try {
					await uploadBillAction(formData);
					toast.success("Bill uploaded successfully");
					router.invalidate();
					resetFile();
					closeAddBillModal();
					resolve(true);
				} catch (error) {
					toast.error("Failed to upload bill", {
						description:
							error instanceof Error ? error.message : "Unknown error",
					});
					resolve(false);
				}
			});
		});
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="font-bold text-3xl">Bills</h1>
					<p className="text-muted-foreground">
						Manage household bills and track payments
					</p>
				</div>
				<Button onClick={openAddBillModal}>
					<IconPlus className="mr-2 h-4 w-4" />
					Add Bill
				</Button>
			</div>

			<SummaryCards summaryData={summaryData} summaryLoading={false} />

			<BillsTable
				bills={bills}
				billsLoading={false}
				paginatedBills={paginatedBills}
				currentPage={currentPage}
				totalPages={totalPages}
				startIndex={startIndex}
				endIndex={endIndex}
				onPrevious={goToPrevious}
				onNext={goToNext}
				onMarkPaid={openMarkPaidModal}
				onDeleteBill={openDeleteModal}
				onAddBill={openAddBillModal}
				processingPayments={isPending}
				deletingBill={isPending}
				billToDelete={billToDelete}
			/>

			<DeleteBillModal
				open={deleteModalOpen}
				onOpenChange={closeDeleteModal}
				onConfirm={handleDeleteConfirm}
				isDeleting={isPending}
			/>

			<MarkPaidModal
				open={markPaidModalOpen}
				onOpenChange={closeMarkPaidModal}
				billToMarkPaid={billToMarkPaid}
				onConfirm={handleMarkPaidConfirm}
				isProcessing={isPending}
			/>

			<AddBillModal
				open={addBillModalOpen}
				onOpenChange={closeAddBillModal}
				selectedFile={selectedFile}
				onFileSelect={handleFileSelect}
				onUpload={handleUploadBill}
				uploadResult={null}
				setUploadResult={() => {}}
				isUploading={isPending}
			/>
		</div>
	);
}
