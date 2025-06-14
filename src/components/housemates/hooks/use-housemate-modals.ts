import { useState } from "react";
import type { Housemate, HousemateFormData } from "../types";

const initialFormData: HousemateFormData = {
	name: "",
	email: "",
	bankAlias: "",
};

export function useHousemateModals() {
	const [addModalOpen, setAddModalOpen] = useState(false);
	const [editModalOpen, setEditModalOpen] = useState(false);
	const [deactivateModalOpen, setDeactivateModalOpen] = useState(false);
	const [viewDetailsModalOpen, setViewDetailsModalOpen] = useState(false);
	const [selectedHousemate, setSelectedHousemate] = useState<Housemate | null>(
		null,
	);
	const [addFormData, setAddFormData] =
		useState<HousemateFormData>(initialFormData);
	const [editFormData, setEditFormData] =
		useState<HousemateFormData>(initialFormData);

	const openAddModal = () => {
		setAddFormData(initialFormData);
		setAddModalOpen(true);
	};

	const closeAddModal = () => {
		setAddModalOpen(false);
		setAddFormData(initialFormData);
	};

	const openEditModal = (housemate: Housemate) => {
		setSelectedHousemate(housemate);
		setEditFormData({
			name: housemate.name || "",
			email: housemate.email || "",
			bankAlias: housemate.bankAlias || "",
		});
		setEditModalOpen(true);
	};

	const closeEditModal = () => {
		setEditModalOpen(false);
		setEditFormData(initialFormData);
		setSelectedHousemate(null);
	};

	const openDeactivateModal = (housemate: Housemate) => {
		setSelectedHousemate(housemate);
		setDeactivateModalOpen(true);
	};

	const closeDeactivateModal = () => {
		setDeactivateModalOpen(false);
		setSelectedHousemate(null);
	};

	const openViewDetailsModal = (housemate: Housemate) => {
		setSelectedHousemate(housemate);
		setViewDetailsModalOpen(true);
	};

	const closeViewDetailsModal = () => {
		setViewDetailsModalOpen(false);
		setSelectedHousemate(null);
	};

	return {
		// Add Modal
		addModalOpen,
		addFormData,
		setAddFormData,
		openAddModal,
		closeAddModal,

		// Edit Modal
		editModalOpen,
		editFormData,
		setEditFormData,
		openEditModal,
		closeEditModal,

		// Deactivate Modal
		deactivateModalOpen,
		openDeactivateModal,
		closeDeactivateModal,

		// View Details Modal
		viewDetailsModalOpen,
		openViewDetailsModal,
		closeViewDetailsModal,

		// Selected Housemate
		selectedHousemate,
	};
}
