import { useState } from "react";
import type { GroupedBill } from "../types";

export function useBillModals() {
	const [deleteModalOpen, setDeleteModalOpen] = useState(false);
	const [billToDelete, setBillToDelete] = useState<string | null>(null);
	const [markPaidModalOpen, setMarkPaidModalOpen] = useState(false);
	const [billToMarkPaid, setBillToMarkPaid] = useState<GroupedBill | null>(
		null,
	);
	const [addBillModalOpen, setAddBillModalOpen] = useState(false);
	const [viewPdfModalOpen, setViewPdfModalOpen] = useState(false);
	const [billToViewPdf, setBillToViewPdf] = useState<GroupedBill | null>(null);
	const [reminderSettingsModalOpen, setReminderSettingsModalOpen] =
		useState(false);
	const [billToEditReminders, setBillToEditReminders] =
		useState<GroupedBill | null>(null);

	const openDeleteModal = (billId: string) => {
		setBillToDelete(billId);
		setDeleteModalOpen(true);
	};

	const closeDeleteModal = () => {
		setDeleteModalOpen(false);
		setBillToDelete(null);
	};

	const openMarkPaidModal = (bill: GroupedBill) => {
		setBillToMarkPaid(bill);
		setMarkPaidModalOpen(true);
	};

	const closeMarkPaidModal = () => {
		setMarkPaidModalOpen(false);
		setBillToMarkPaid(null);
	};

	const openAddBillModal = () => {
		setAddBillModalOpen(true);
	};

	const closeAddBillModal = () => {
		setAddBillModalOpen(false);
	};

	const openViewPdfModal = (bill: GroupedBill) => {
		setBillToViewPdf(bill);
		setViewPdfModalOpen(true);
	};

	const closeViewPdfModal = () => {
		setViewPdfModalOpen(false);
		setBillToViewPdf(null);
	};

	const openReminderSettingsModal = (bill: GroupedBill) => {
		setBillToEditReminders(bill);
		setReminderSettingsModalOpen(true);
	};

	const closeReminderSettingsModal = () => {
		setReminderSettingsModalOpen(false);
		setBillToEditReminders(null);
	};

	return {
		// Delete modal
		deleteModalOpen,
		billToDelete,
		openDeleteModal,
		closeDeleteModal,

		// Mark paid modal
		markPaidModalOpen,
		billToMarkPaid,
		openMarkPaidModal,
		closeMarkPaidModal,

		// Add bill modal
		addBillModalOpen,
		openAddBillModal,
		closeAddBillModal,

		// PDF modal
		viewPdfModalOpen,
		billToViewPdf,
		openViewPdfModal,
		closeViewPdfModal,

		// Reminder settings modal
		reminderSettingsModalOpen,
		billToEditReminders,
		openReminderSettingsModal,
		closeReminderSettingsModal,
	};
}
