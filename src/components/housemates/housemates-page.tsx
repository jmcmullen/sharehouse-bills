import { Button } from "@/components/ui/button";
import { IconPlus } from "@tabler/icons-react";
import { useLoaderData, useRouter } from "@tanstack/react-router";
import { useTransition } from "react";
import { toast } from "sonner";
import {
	createHousemateAction,
	deactivateHousemateAction,
	reactivateHousemateAction,
	updateHousemateAction,
} from "./actions";
import { useHousemateDetails } from "./hooks/use-housemate-details";
import { useHousemateModals } from "./hooks/use-housemate-modals";
import { HousematesTable } from "./housemates-table";
import { AddHousemateModal } from "./modals/add-housemate-modal";
import { DeactivateHousemateModal } from "./modals/deactivate-housemate-modal";
import { EditHousemateModal } from "./modals/edit-housemate-modal";
import { HousemateDetailsModal } from "./modals/housemate-details-modal";
import { validateHousemateForm } from "./utils";

export function HousematesPage() {
	const { housematesData } = useLoaderData({ from: "/housemates" });
	const router = useRouter();
	const [isPending, startTransition] = useTransition();

	const {
		addModalOpen,
		addFormData,
		setAddFormData,
		openAddModal,
		closeAddModal,
		editModalOpen,
		editFormData,
		setEditFormData,
		openEditModal,
		closeEditModal,
		deactivateModalOpen,
		openDeactivateModal,
		closeDeactivateModal,
		viewDetailsModalOpen,
		openViewDetailsModal,
		closeViewDetailsModal,
		selectedHousemate,
	} = useHousemateModals();

	const { stats, debts, statsLoading, debtsLoading } = useHousemateDetails(
		selectedHousemate?.id || null,
		viewDetailsModalOpen,
	);

	const handleAddSubmit = () => {
		const validationError = validateHousemateForm(addFormData);
		if (validationError) {
			toast.error(validationError);
			return;
		}

		startTransition(async () => {
			try {
				await createHousemateAction(addFormData);
				toast.success("Housemate added successfully");
				router.invalidate();
				closeAddModal();
			} catch (error) {
				toast.error("Failed to add housemate", {
					description: error instanceof Error ? error.message : "Unknown error",
				});
			}
		});
	};

	const handleEditSubmit = () => {
		if (!selectedHousemate) return;

		const validationError = validateHousemateForm(editFormData);
		if (validationError) {
			toast.error(validationError);
			return;
		}

		startTransition(async () => {
			try {
				await updateHousemateAction({
					id: selectedHousemate.id,
					...editFormData,
				});
				toast.success("Housemate updated successfully");
				router.invalidate();
				closeEditModal();
			} catch (error) {
				toast.error("Failed to update housemate", {
					description: error instanceof Error ? error.message : "Unknown error",
				});
			}
		});
	};

	const handleDeactivateSubmit = () => {
		if (!selectedHousemate) return;

		startTransition(async () => {
			try {
				await deactivateHousemateAction(selectedHousemate.id);
				toast.success("Housemate deactivated successfully");
				router.invalidate();
				closeDeactivateModal();
			} catch (error) {
				toast.error("Failed to deactivate housemate", {
					description: error instanceof Error ? error.message : "Unknown error",
				});
			}
		});
	};

	const handleReactivate = (housemateId: number) => {
		startTransition(async () => {
			try {
				await reactivateHousemateAction(housemateId);
				toast.success("Housemate reactivated successfully");
				router.invalidate();
			} catch (error) {
				toast.error("Failed to reactivate housemate", {
					description: error instanceof Error ? error.message : "Unknown error",
				});
			}
		});
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="font-bold text-3xl">Housemates</h1>
					<p className="text-muted-foreground">
						Manage household members and track their payment history
					</p>
				</div>
				<Button onClick={openAddModal}>
					<IconPlus className="mr-2 h-4 w-4" />
					Add Housemate
				</Button>
			</div>

			<HousematesTable
				housemates={housematesData}
				isLoading={false}
				onAddHousemate={openAddModal}
				onViewDetails={openViewDetailsModal}
				onEdit={openEditModal}
				onDeactivate={openDeactivateModal}
				onReactivate={handleReactivate}
				isReactivating={isPending}
			/>

			<AddHousemateModal
				open={addModalOpen}
				onOpenChange={closeAddModal}
				formData={addFormData}
				onFormDataChange={setAddFormData}
				onSubmit={handleAddSubmit}
				isLoading={isPending}
			/>

			<EditHousemateModal
				open={editModalOpen}
				onOpenChange={closeEditModal}
				formData={editFormData}
				onFormDataChange={setEditFormData}
				onSubmit={handleEditSubmit}
				isLoading={isPending}
			/>

			<DeactivateHousemateModal
				open={deactivateModalOpen}
				onOpenChange={closeDeactivateModal}
				housemate={selectedHousemate}
				onConfirm={handleDeactivateSubmit}
				isLoading={isPending}
			/>

			<HousemateDetailsModal
				open={viewDetailsModalOpen}
				onOpenChange={closeViewDetailsModal}
				housemate={selectedHousemate}
				stats={stats}
				debts={debts}
				statsLoading={statsLoading}
				debtsLoading={debtsLoading}
			/>
		</div>
	);
}
