import { Button } from "@/components/ui/button";
import { IconPlus } from "@tabler/icons-react";
import { useLoaderData, useRouter } from "@tanstack/react-router";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	deleteBillAction,
	markDebtPaidAction,
	updateBillReminderSettingsAction,
	uploadBillAction,
} from "./actions";
import { BillsTable } from "./bills-table";
import { useBillModals } from "./hooks/use-bill-modals";
import { useFileUpload } from "./hooks/use-file-upload";
import { usePagination } from "./hooks/use-pagination";
import { AddBillModal } from "./modals/add-bill-modal";
import { BillReminderSettingsModal } from "./modals/bill-reminder-settings-modal";
import { DeleteBillModal } from "./modals/delete-bill-modal";
import { MarkPaidModal } from "./modals/mark-paid-modal";
import { ViewBillPdfModal } from "./modals/view-bill-pdf-modal";
import { SummaryCards } from "./summary-cards";
import type { BillReminderFormData } from "./types";
import {
	buildBillReminderFormData,
	calculateSummary,
	getBillReminderFormPayload,
	groupBillsByBillId,
	validateBillReminderForm,
} from "./utils";

export function BillsPage() {
	const { billsData } = useLoaderData({ from: "/_app/bills" });
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
		viewPdfModalOpen,
		billToViewPdf,
		openViewPdfModal,
		closeViewPdfModal,
		reminderSettingsModalOpen,
		billToEditReminders,
		openReminderSettingsModal,
		closeReminderSettingsModal,
	} = useBillModals();
	const [reminderFormData, setReminderFormData] =
		useState<BillReminderFormData>({
			remindersEnabled: true,
			reminderMode: "individual",
			stackGroup: "",
			preDueOffsetsInput: "1, 0",
			overdueCadence: "weekly",
			overdueWeekday: "2",
		});

	const { selectedFile, handleFileSelect, resetFile } = useFileUpload();

	const summaryData = calculateSummary(billsData);
	const groupedBills = groupBillsByBillId(billsData);
	const bills = Object.values(groupedBills).sort((left, right) => {
		return (
			new Date(right.bill.dueDate).getTime() -
			new Date(left.bill.dueDate).getTime()
		);
	});

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
		payments: Array<{ debtId: string; amountPaid: number }>,
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

		return new Promise((resolve) => {
			startTransition(async () => {
				try {
					await uploadBillAction(selectedFile);
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

	const handleOpenReminderSettings = (bill: (typeof bills)[number]) => {
		setReminderFormData(buildBillReminderFormData(bill.bill));
		openReminderSettingsModal(bill);
	};

	const handleSaveReminderSettings = () => {
		if (!billToEditReminders) {
			return;
		}

		const validationError = validateBillReminderForm(reminderFormData);
		if (validationError) {
			toast.error(validationError);
			return;
		}

		startTransition(async () => {
			try {
				await updateBillReminderSettingsAction({
					billId: billToEditReminders.bill.id,
					config: getBillReminderFormPayload(reminderFormData),
				});
				toast.success("Reminder settings updated");
				closeReminderSettingsModal();
				router.invalidate();
			} catch (error) {
				toast.error("Failed to update reminder settings", {
					description: error instanceof Error ? error.message : "Unknown error",
				});
			}
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
				onViewPdf={openViewPdfModal}
				onEditReminders={handleOpenReminderSettings}
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

			<ViewBillPdfModal
				open={viewPdfModalOpen}
				onOpenChange={closeViewPdfModal}
				bill={billToViewPdf}
			/>

			<BillReminderSettingsModal
				open={reminderSettingsModalOpen}
				onOpenChange={(open) => {
					if (!open) {
						closeReminderSettingsModal();
					}
				}}
				bill={billToEditReminders}
				formData={reminderFormData}
				onFormDataChange={setReminderFormData}
				onSubmit={handleSaveReminderSettings}
				isSaving={isPending}
			/>
		</div>
	);
}
