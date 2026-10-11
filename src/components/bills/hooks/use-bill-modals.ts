import { useState } from "react";
import type { BillListItem } from "../types";

export function useBillModals() {
	const [deleteModalOpen, setDeleteModalOpen] = useState(false);
	const [billToDelete, setBillToDelete] = useState<string | null>(null);
	const [cashModalOpen, setCashModalOpen] = useState(false);
	const [billForCash, setBillForCash] = useState<BillListItem | null>(null);
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

	const openCashModal = (bill: BillListItem) => {
		setBillForCash(bill);
		setCashModalOpen(true);
	};

	const closeCashModal = () => {
		setCashModalOpen(false);
		setBillForCash(null);
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

		// Record cash modal
		cashModalOpen,
		billForCash,
		openCashModal,
		closeCashModal,

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
