import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconPlus } from "@tabler/icons-react";
import { useLoaderData, useRouter } from "@tanstack/react-router";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	createRecurringBillAction,
	deleteRecurringBillAction,
	generateRecurringBillNowAction,
	setRecurringBillActiveAction,
	updateRecurringBillAction,
} from "./actions";
import { DeleteRecurringBillModal } from "./modals/delete-recurring-bill-modal";
import { RecurringBillModal } from "./modals/recurring-bill-modal";
import { RecurringBillsTable } from "./recurring-bills-table";
import type { RecurringBillFormData, RecurringBillListItem } from "./types";
import {
	buildEmptyRecurringBillFormData,
	buildRecurringBillFormData,
	formatDate,
	validateRecurringBillForm,
} from "./utils";

export function RecurringBillsPage() {
	const { recurringBillsData, activeHousemates } = useLoaderData({
		from: "/recurring-bills",
	});
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [modalOpen, setModalOpen] = useState(false);
	const [modalMode, setModalMode] = useState<"create" | "edit">("create");
	const [formData, setFormData] = useState<RecurringBillFormData>(
		buildEmptyRecurringBillFormData(activeHousemates),
	);
	const [itemToDelete, setItemToDelete] =
		useState<RecurringBillListItem | null>(null);

	const activeTemplates = recurringBillsData.filter(
		(item) => item.template.isActive,
	).length;
	const nextDueItems = recurringBillsData.filter(
		(item) => item.nextDueDate !== null,
	);
	const generatedCount = recurringBillsData.reduce(
		(sum, item) => sum + item.generatedCount,
		0,
	);

	const openCreateModal = () => {
		setModalMode("create");
		setFormData(buildEmptyRecurringBillFormData(activeHousemates));
		setModalOpen(true);
	};

	const openEditModal = (item: RecurringBillListItem) => {
		setModalMode("edit");
		setFormData(buildRecurringBillFormData(item, activeHousemates));
		setModalOpen(true);
	};

	const handleSubmit = () => {
		const validationError = validateRecurringBillForm(formData);
		if (validationError) {
			toast.error(validationError);
			return;
		}

		startTransition(async () => {
			try {
				if (modalMode === "create") {
					await createRecurringBillAction(formData);
					toast.success("Recurring bill created");
				} else {
					await updateRecurringBillAction(formData);
					toast.success("Recurring bill updated");
				}
				setModalOpen(false);
				router.invalidate();
			} catch (error) {
				toast.error("Failed to save recurring bill", {
					description: error instanceof Error ? error.message : "Unknown error",
				});
			}
		});
	};

	const handleToggleActive = (item: RecurringBillListItem) => {
		startTransition(async () => {
			try {
				await setRecurringBillActiveAction(
					item.template.id,
					!item.template.isActive,
				);
				toast.success(
					item.template.isActive
						? "Recurring bill paused"
						: "Recurring bill resumed",
				);
				router.invalidate();
			} catch (error) {
				toast.error("Failed to update recurring bill", {
					description: error instanceof Error ? error.message : "Unknown error",
				});
			}
		});
	};

	const handleGenerateNow = (item: RecurringBillListItem) => {
		startTransition(async () => {
			try {
				const result = await generateRecurringBillNowAction(item.template.id);
				if (result.duplicate) {
					toast.info("Bill already exists for the next due date", {
						description: `Bill ${result.billId} is already scheduled for ${formatDate(
							result.dueDate,
						)}`,
					});
				} else {
					toast.success("Recurring bill generated", {
						description: `${item.template.templateName} created for ${formatDate(
							result.dueDate,
						)}`,
					});
				}
				router.invalidate();
			} catch (error) {
				toast.error("Failed to generate recurring bill", {
					description: error instanceof Error ? error.message : "Unknown error",
				});
			}
		});
	};

	const handleDeleteConfirm = () => {
		if (!itemToDelete) {
			return;
		}

		startTransition(async () => {
			try {
				await deleteRecurringBillAction(itemToDelete.template.id);
				toast.success("Recurring bill deleted");
				setItemToDelete(null);
				router.invalidate();
			} catch (error) {
				toast.error("Failed to delete recurring bill", {
					description: error instanceof Error ? error.message : "Unknown error",
				});
			}
		});
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="font-bold text-3xl">Recurring Bills</h1>
					<p className="text-muted-foreground">
						Manage rent and other repeating charges from one place.
					</p>
				</div>
				<Button onClick={openCreateModal}>
					<IconPlus className="mr-2 h-4 w-4" />
					Add Recurring Bill
				</Button>
			</div>

			<div className="grid gap-4 md:grid-cols-3">
				<Card>
					<CardHeader>
						<CardTitle className="text-sm">Active Templates</CardTitle>
					</CardHeader>
					<CardContent className="font-semibold text-2xl">
						{activeTemplates}
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle className="text-sm">Upcoming</CardTitle>
					</CardHeader>
					<CardContent className="space-y-1">
						<div className="font-semibold text-2xl">{nextDueItems.length}</div>
						<p className="text-muted-foreground text-sm">
							{nextDueItems[0]
								? `Next due ${formatDate(nextDueItems[0].nextDueDate)}`
								: "Nothing scheduled"}
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle className="text-sm">Generated Bills</CardTitle>
					</CardHeader>
					<CardContent className="space-y-1">
						<div className="font-semibold text-2xl">{generatedCount}</div>
						<p className="text-muted-foreground text-sm">
							Tracked recurring bill output to date
						</p>
					</CardContent>
				</Card>
			</div>

			<RecurringBillsTable
				items={recurringBillsData}
				onAdd={openCreateModal}
				onEdit={openEditModal}
				onToggleActive={handleToggleActive}
				onGenerateNow={handleGenerateNow}
				onDelete={setItemToDelete}
				isPending={isPending}
			/>

			<RecurringBillModal
				open={modalOpen}
				onOpenChange={setModalOpen}
				mode={modalMode}
				formData={formData}
				onFormDataChange={setFormData}
				onSubmit={handleSubmit}
				isLoading={isPending}
			/>

			<DeleteRecurringBillModal
				open={itemToDelete !== null}
				onOpenChange={(open) => {
					if (!open) {
						setItemToDelete(null);
					}
				}}
				onConfirm={handleDeleteConfirm}
				isDeleting={isPending}
				templateName={itemToDelete?.template.templateName ?? null}
			/>
		</div>
	);
}
