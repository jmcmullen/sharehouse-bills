import { useState } from "react";
import type { GroupedBill } from "../types";

export function useBillModals() {
	const [deleteModalOpen, setDeleteModalOpen] = useState(false);
	const [billToDelete, setBillToDelete] = useState<number | null>(null);
	const [markPaidModalOpen, setMarkPaidModalOpen] = useState(false);
	const [billToMarkPaid, setBillToMarkPaid] = useState<GroupedBill | null>(
		null,
	);
	const [addBillModalOpen, setAddBillModalOpen] = useState(false);

	const openDeleteModal = (billId: number) => {
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
	};
}
