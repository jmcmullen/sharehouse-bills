// fallow-ignore-file code-duplication
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/money";
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
import { HousemateOutstandingChart } from "./housemate-outstanding-chart";
import { HousematesTable } from "./housemates-table";
import { AddHousemateModal } from "./modals/add-housemate-modal";
import { DeactivateHousemateModal } from "./modals/deactivate-housemate-modal";
import { EditHousemateModal } from "./modals/edit-housemate-modal";
import { HousemateDetailsModal } from "./modals/housemate-details-modal";
import { validateHousemateForm } from "./utils";

export function HousematesPage() {
	const { housematesData, balances } = useLoaderData({
		from: "/_app/housemates",
	});
	const { outstanding, overdue } = balances;
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

	const { account, isLoading: accountLoading } = useHousemateDetails(
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

	const handleReactivate = (housemateId: string) => {
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
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="font-bold text-3xl">Housemates</h1>
					<p className="text-muted-foreground">
						Manage household members and track their payment history
					</p>
				</div>
				<Button className="self-start sm:self-auto" onClick={openAddModal}>
					<IconPlus className="mr-2 h-4 w-4" />
					Add Housemate
				</Button>
			</div>

			<div className="grid gap-6 xl:grid-cols-2">
				<HousemateOutstandingChart
					balances={outstanding}
					title="Outstanding by Housemate"
					metricLabel="Outstanding"
					description={`${formatCents(outstanding.totalCents)} unpaid across ${formatHousemateCount(outstanding.count)}`}
					emptyDescription="No outstanding balances right now"
					summary={`${formatHousemateCount(outstanding.count)} currently have unpaid balances`}
					emptySummary="Everyone is fully paid up"
					footerNote="Showing current outstanding debt by housemate"
					color="var(--chart-2)"
				/>
				<HousemateOutstandingChart
					balances={overdue}
					title="Overdue Now"
					metricLabel="Overdue"
					description={`${formatCents(overdue.totalCents)} overdue across ${formatHousemateCount(overdue.count)}`}
					emptyDescription="No overdue balances right now"
					summary={`${formatHousemateCount(overdue.count)} have bills past their due date`}
					emptySummary="No one is overdue right now"
					footerNote="Showing unpaid debt with a due date before today"
					color="var(--chart-1)"
				/>
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
				housemate={selectedHousemate}
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
				account={account}
				isLoading={accountLoading}
			/>
		</div>
	);
}

function formatHousemateCount(count: number) {
	return `${count} housemate${count === 1 ? "" : "s"}`;
}
