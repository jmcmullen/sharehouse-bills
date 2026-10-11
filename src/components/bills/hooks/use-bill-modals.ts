import { useState } from "react";
import type { BillListItem } from "../types";

export function useBillModals() {
	const [deleteModalOpen, setDeleteModalOpen] = useState(false);
	const [billToDelete, setBillToDelete] = useState<string | null>(null);
	const [addBillModalOpen, setAddBillModalOpen] = useState(false);
	const [viewPdfModalOpen, setViewPdfModalOpen] = useState(false);
	const [billToViewPdf, setBillToViewPdf] = useState<BillListItem | null>(null);

	const openDeleteModal = (billId: string) => {
		setBillToDelete(billId);
		setDeleteModalOpen(true);
	};

	const closeDeleteModal = () => {
		setDeleteModalOpen(false);
		setBillToDelete(null);
	};

	const openAddBillModal = () => {
		setAddBillModalOpen(true);
	};

	const closeAddBillModal = () => {
		setAddBillModalOpen(false);
	};

	const openViewPdfModal = (bill: BillListItem) => {
		setBillToViewPdf(bill);
		setViewPdfModalOpen(true);
	};

	const closeViewPdfModal = () => {
		setViewPdfModalOpen(false);
		setBillToViewPdf(null);
	};

	return {
		// Delete modal
		deleteModalOpen,
		billToDelete,
		openDeleteModal,
		closeDeleteModal,

		// Add bill modal
		addBillModalOpen,
		openAddBillModal,
		closeAddBillModal,

		// PDF modal
		viewPdfModalOpen,
		billToViewPdf,
		openViewPdfModal,
		closeViewPdfModal,
	};
}
