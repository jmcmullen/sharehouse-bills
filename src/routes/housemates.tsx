import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	createHousemate,
	deactivateHousemate,
	getAllHousemates,
	getHousemateDebts,
	getHousemateStats,
	reactivateHousemate,
	updateHousemate,
} from "@/functions/housemates";
import {
	IconChartPie,
	IconCheck,
	IconCrown,
	IconCurrencyDollar,
	IconEdit,
	IconEye,
	IconMail,
	IconPlus,
	IconTrash,
	IconUser,
	IconUsers,
	IconX,
} from "@tabler/icons-react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/housemates")({
	beforeLoad: async ({ context }) => {
		// Redirect to login if not authenticated
		if (!context.session?.user) {
			throw redirect({
				to: "/login",
			});
		}
	},
	component: RouteComponent,
});

interface Housemate {
	id: number;
	name: string;
	email?: string;
	bankAlias?: string;
	isActive: boolean;
	isOwner: boolean;
	createdAt: string;
}

interface HousemateStats {
	totalOwed: number;
	totalPaid: number;
	totalOutstanding: number;
}

interface HousemateDebt {
	debt: {
		id: number;
		amountOwed: number;
		isPaid: boolean;
		paidAt?: string;
	};
	bill: {
		id: number;
		billerName: string;
		dueDate: string;
	};
}

function RouteComponent() {
	// Data state
	const [housemates, setHousemates] = useState<Housemate[]>([]);
	const [housematesLoading, setHousematesLoading] = useState(true);
	const [housemateStats, setHousemateStats] = useState<HousemateStats | null>(
		null,
	);
	const [statsLoading, setStatsLoading] = useState(false);
	const [housemateDebts, setHousemateDebts] = useState<HousemateDebt[]>([]);
	const [debtsLoading, setDebtsLoading] = useState(false);

	// Modal states
	const [addHousemateModalOpen, setAddHousemateModalOpen] = useState(false);
	const [editHousemateModalOpen, setEditHousemateModalOpen] = useState(false);
	const [deactivateModalOpen, setDeactivateModalOpen] = useState(false);
	const [viewDetailsModalOpen, setViewDetailsModalOpen] = useState(false);

	// Selected housemate for actions
	const [selectedHousemate, setSelectedHousemate] = useState<Housemate | null>(
		null,
	);

	// Form states
	const [newHousemate, setNewHousemate] = useState({
		name: "",
		email: "",
		bankAlias: "",
	});

	const [editHousemate, setEditHousemate] = useState({
		name: "",
		email: "",
		bankAlias: "",
	});

	// Loading states for mutations
	const [isCreating, setIsCreating] = useState(false);
	const [isUpdating, setIsUpdating] = useState(false);
	const [isDeactivating, setIsDeactivating] = useState(false);
	const [isReactivating, setIsReactivating] = useState(false);

	// Load housemates
	const loadHousemates = useCallback(async () => {
		try {
			setHousematesLoading(true);
			const data = await getAllHousemates();
			setHousemates(data);
		} catch (error) {
			console.error("Failed to load housemates:", error);
		} finally {
			setHousematesLoading(false);
		}
	}, []);

	// Load housemate stats
	const loadHousemateStats = useCallback(async (housemateId: number) => {
		try {
			setStatsLoading(true);
			const data = await getHousemateStats({ housemateId });
			setHousemateStats(data);
		} catch (error) {
			console.error("Failed to load housemate stats:", error);
		} finally {
			setStatsLoading(false);
		}
	}, []);

	// Load housemate debts
	const loadHousemateDebts = useCallback(async (housemateId: number) => {
		try {
			setDebtsLoading(true);
			const data = await getHousemateDebts({ housemateId });
			setHousemateDebts(data);
		} catch (error) {
			console.error("Failed to load housemate debts:", error);
		} finally {
			setDebtsLoading(false);
		}
	}, []);

	useEffect(() => {
		loadHousemates();
	}, [loadHousemates]);

	useEffect(() => {
		if (selectedHousemate?.id && viewDetailsModalOpen) {
			loadHousemateStats(selectedHousemate.id);
			loadHousemateDebts(selectedHousemate.id);
		}
	}, [
		selectedHousemate?.id,
		viewDetailsModalOpen,
		loadHousemateStats,
		loadHousemateDebts,
	]);

	// Create housemate function
	const handleCreateHousemate = async (data: {
		name: string;
		email?: string;
		bankAlias?: string;
	}) => {
		try {
			setIsCreating(true);
			await createHousemate(data);
			await loadHousemates();
			setAddHousemateModalOpen(false);
			setNewHousemate({ name: "", email: "", bankAlias: "" });
			toast.success("Housemate added successfully");
		} catch (error) {
			toast.error(
				`Failed to add housemate: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		} finally {
			setIsCreating(false);
		}
	};

	// Update housemate function
	const handleUpdateHousemate = async (data: {
		id: number;
		name: string;
		email?: string;
		bankAlias?: string;
	}) => {
		try {
			setIsUpdating(true);
			await updateHousemate(data);
			await loadHousemates();
			setEditHousemateModalOpen(false);
			setSelectedHousemate(null);
			setEditHousemate({ name: "", email: "", bankAlias: "" });
			toast.success("Housemate updated successfully");
		} catch (error) {
			toast.error(
				`Failed to update housemate: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		} finally {
			setIsUpdating(false);
		}
	};

	// Deactivate housemate function
	const handleDeactivateHousemate = async (id: number) => {
		try {
			setIsDeactivating(true);
			await deactivateHousemate({ id });
			await loadHousemates();
			setDeactivateModalOpen(false);
			setSelectedHousemate(null);
			toast.success("Housemate deactivated successfully");
		} catch (error) {
			toast.error(
				`Failed to deactivate housemate: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		} finally {
			setIsDeactivating(false);
		}
	};

	// Reactivate housemate function
	const handleReactivateHousemate = async (id: number) => {
		try {
			setIsReactivating(true);
			await reactivateHousemate({ id });
			await loadHousemates();
			toast.success("Housemate reactivated successfully");
		} catch (error) {
			toast.error(
				`Failed to reactivate housemate: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		} finally {
			setIsReactivating(false);
		}
	};

	const formatCurrency = (amount: number) => {
		return new Intl.NumberFormat("en-AU", {
			style: "currency",
			currency: "AUD",
		}).format(amount);
	};

	const formatDate = (date: Date | string) => {
		return new Date(date).toLocaleDateString("en-AU", {
			day: "numeric",
			month: "short",
			year: "numeric",
		});
	};

	const getStatusBadge = (housemate: Housemate) => {
		if (housemate.isOwner) {
			return (
				<Badge
					variant="default"
					className="border-purple-200 bg-purple-100 text-purple-800"
				>
					<IconCrown className="mr-1 h-3 w-3" />
					Owner
				</Badge>
			);
		}

		if (housemate.isActive) {
			return (
				<Badge
					variant="default"
					className="border-green-200 bg-green-100 text-green-800"
				>
					<IconCheck className="mr-1 h-3 w-3" />
					Active
				</Badge>
			);
		}

		return (
			<Badge
				variant="outline"
				className="border-gray-200 bg-gray-100 text-gray-800"
			>
				<IconX className="mr-1 h-3 w-3" />
				Inactive
			</Badge>
		);
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
				<Button onClick={() => setAddHousemateModalOpen(true)}>
					<IconPlus className="mr-2 h-4 w-4" />
					Add Housemate
				</Button>
			</div>

			{/* Housemates Table */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<IconUsers className="h-5 w-5" />
						All Housemates
					</CardTitle>
				</CardHeader>
				<CardContent>
					{housematesLoading ? (
						<div className="space-y-3">
							{[
								"housemate-skeleton-1",
								"housemate-skeleton-2",
								"housemate-skeleton-3",
							].map((key) => (
								<Skeleton key={key} className="h-12 w-full" />
							))}
						</div>
					) : housemates?.length === 0 ? (
						<div className="py-8 text-center">
							<IconUsers className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
							<h3 className="mb-2 font-semibold text-lg">
								No housemates found
							</h3>
							<p className="mb-4 text-muted-foreground">
								Get started by adding your first housemate
							</p>
							<Button onClick={() => setAddHousemateModalOpen(true)}>
								<IconPlus className="mr-2 h-4 w-4" />
								Add Your First Housemate
							</Button>
						</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Name</TableHead>
									<TableHead>Email</TableHead>
									<TableHead>Bank Alias</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Joined</TableHead>
									<TableHead className="text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{housemates?.map((housemate) => (
									<TableRow key={housemate.id}>
										<TableCell className="font-medium">
											<div className="flex items-center gap-2">
												<IconUser className="h-4 w-4 text-muted-foreground" />
												{housemate.name}
											</div>
										</TableCell>
										<TableCell>
											<div className="flex items-center gap-2">
												{housemate.email ? (
													<>
														<IconMail className="h-4 w-4 text-muted-foreground" />
														{housemate.email}
													</>
												) : (
													<span className="text-muted-foreground">
														No email
													</span>
												)}
											</div>
										</TableCell>
										<TableCell>
											{housemate.bankAlias || (
												<span className="text-muted-foreground">Not set</span>
											)}
										</TableCell>
										<TableCell>{getStatusBadge(housemate)}</TableCell>
										<TableCell>{formatDate(housemate.createdAt)}</TableCell>
										<TableCell className="text-right">
											<div className="flex items-center justify-end gap-2">
												<Button
													variant="outline"
													size="sm"
													onClick={() => {
														setSelectedHousemate(housemate);
														setViewDetailsModalOpen(true);
													}}
												>
													<IconEye className="h-4 w-4" />
												</Button>
												<Button
													variant="outline"
													size="sm"
													onClick={() => {
														setSelectedHousemate(housemate);
														setEditHousemate({
															name: housemate.name || "",
															email: housemate.email || "",
															bankAlias: housemate.bankAlias || "",
														});
														setEditHousemateModalOpen(true);
													}}
												>
													<IconEdit className="h-4 w-4" />
												</Button>
												{housemate.isActive ? (
													<Button
														variant="destructive"
														size="sm"
														onClick={() => {
															setSelectedHousemate(housemate);
															setDeactivateModalOpen(true);
														}}
														disabled={housemate.isOwner}
													>
														<IconTrash className="h-4 w-4" />
													</Button>
												) : (
													<Button
														variant="outline"
														size="sm"
														className="border-green-200 text-green-600 hover:bg-green-50"
														onClick={() => {
															handleReactivateHousemate(housemate.id);
														}}
														disabled={isReactivating}
													>
														Reactivate
													</Button>
												)}
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>

			{/* Add Housemate Modal */}
			<Dialog
				open={addHousemateModalOpen}
				onOpenChange={setAddHousemateModalOpen}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Add New Housemate</DialogTitle>
						<DialogDescription>
							Add a new member to your household for bill tracking
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-4">
						<div className="space-y-2">
							<Label htmlFor="name">Name *</Label>
							<Input
								id="name"
								value={newHousemate.name}
								onChange={(e) =>
									setNewHousemate({ ...newHousemate, name: e.target.value })
								}
								placeholder="Enter full name"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								type="email"
								value={newHousemate.email}
								onChange={(e) =>
									setNewHousemate({ ...newHousemate, email: e.target.value })
								}
								placeholder="Enter email address"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="bankAlias">Bank Alias</Label>
							<Input
								id="bankAlias"
								value={newHousemate.bankAlias}
								onChange={(e) =>
									setNewHousemate({
										...newHousemate,
										bankAlias: e.target.value,
									})
								}
								placeholder="Name used in bank transfers"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setAddHousemateModalOpen(false)}
						>
							Cancel
						</Button>
						<Button
							onClick={() => {
								if (!newHousemate.name.trim()) {
									toast.error("Name is required");
									return;
								}
								handleCreateHousemate({
									name: newHousemate.name.trim(),
									email: newHousemate.email.trim() || undefined,
									bankAlias: newHousemate.bankAlias.trim() || undefined,
								});
							}}
							disabled={isCreating}
						>
							{isCreating ? "Adding..." : "Add Housemate"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Edit Housemate Modal */}
			<Dialog
				open={editHousemateModalOpen}
				onOpenChange={setEditHousemateModalOpen}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Edit Housemate</DialogTitle>
						<DialogDescription>Update housemate information</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-4">
						<div className="space-y-2">
							<Label htmlFor="editName">Name *</Label>
							<Input
								id="editName"
								value={editHousemate.name}
								onChange={(e) =>
									setEditHousemate({
										...editHousemate,
										name: e.target.value,
									})
								}
								placeholder="Enter full name"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="editEmail">Email</Label>
							<Input
								id="editEmail"
								type="email"
								value={editHousemate.email}
								onChange={(e) =>
									setEditHousemate({
										...editHousemate,
										email: e.target.value,
									})
								}
								placeholder="Enter email address"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="editBankAlias">Bank Alias</Label>
							<Input
								id="editBankAlias"
								value={editHousemate.bankAlias}
								onChange={(e) =>
									setEditHousemate({
										...editHousemate,
										bankAlias: e.target.value,
									})
								}
								placeholder="Name used in bank transfers"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setEditHousemateModalOpen(false);
								setEditHousemate({ name: "", email: "", bankAlias: "" });
							}}
						>
							Cancel
						</Button>
						<Button
							onClick={() => {
								if (!editHousemate.name.trim()) {
									toast.error("Name is required");
									return;
								}
								if (selectedHousemate) {
									handleUpdateHousemate({
										id: selectedHousemate.id,
										name: editHousemate.name.trim(),
										email: editHousemate.email.trim() || undefined,
										bankAlias: editHousemate.bankAlias.trim() || undefined,
									});
								}
							}}
							disabled={isUpdating}
						>
							{isUpdating ? "Updating..." : "Update Housemate"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Deactivate Confirmation Modal */}
			<AlertDialog
				open={deactivateModalOpen}
				onOpenChange={setDeactivateModalOpen}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Deactivate Housemate</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to deactivate {selectedHousemate?.name}?
							They will no longer be included in new bills, but their payment
							history will be preserved.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-red-600 hover:bg-red-700"
							onClick={() => {
								if (selectedHousemate) {
									handleDeactivateHousemate(selectedHousemate.id);
								}
							}}
							disabled={isDeactivating}
						>
							{isDeactivating ? "Deactivating..." : "Deactivate"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* View Details Modal */}
			<Dialog
				open={viewDetailsModalOpen}
				onOpenChange={setViewDetailsModalOpen}
			>
				<DialogContent className="!max-w-4xl !w-[70vw] sm:!max-w-4xl max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<IconUser className="h-5 w-5" />
							{selectedHousemate?.name} - Payment Details
						</DialogTitle>
						<DialogDescription>
							Complete payment history and statistics
						</DialogDescription>
					</DialogHeader>

					{selectedHousemate && (
						<div className="space-y-6">
							{/* Stats Cards */}
							<div className="grid gap-4 md:grid-cols-3">
								<Card>
									<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
										<CardTitle className="font-medium text-sm">
											Total Owed
										</CardTitle>
										<IconCurrencyDollar className="h-4 w-4 text-muted-foreground" />
									</CardHeader>
									<CardContent>
										<div className="font-bold text-2xl">
											{statsLoading ? (
												<Skeleton className="h-8 w-20" />
											) : (
												formatCurrency(housemateStats?.totalOwed || 0)
											)}
										</div>
									</CardContent>
								</Card>
								<Card>
									<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
										<CardTitle className="font-medium text-sm">
											Total Paid
										</CardTitle>
										<IconCheck className="h-4 w-4 text-muted-foreground" />
									</CardHeader>
									<CardContent>
										<div className="font-bold text-2xl">
											{statsLoading ? (
												<Skeleton className="h-8 w-20" />
											) : (
												formatCurrency(housemateStats?.totalPaid || 0)
											)}
										</div>
									</CardContent>
								</Card>
								<Card>
									<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
										<CardTitle className="font-medium text-sm">
											Outstanding
										</CardTitle>
										<IconChartPie className="h-4 w-4 text-muted-foreground" />
									</CardHeader>
									<CardContent>
										<div className="font-bold text-2xl">
											{statsLoading ? (
												<Skeleton className="h-8 w-20" />
											) : (
												formatCurrency(housemateStats?.totalOutstanding || 0)
											)}
										</div>
									</CardContent>
								</Card>
							</div>

							{/* Payment History */}
							<Card>
								<CardHeader>
									<CardTitle>Payment History</CardTitle>
								</CardHeader>
								<CardContent>
									{debtsLoading ? (
										<div className="space-y-3">
											{[
												"debt-skeleton-1",
												"debt-skeleton-2",
												"debt-skeleton-3",
											].map((key) => (
												<Skeleton key={key} className="h-12 w-full" />
											))}
										</div>
									) : housemateDebts?.length === 0 ? (
										<div className="py-8 text-center">
											<p className="text-muted-foreground">
												No payment history found
											</p>
										</div>
									) : (
										<div className="overflow-x-auto">
											<Table>
												<TableHeader>
													<TableRow>
														<TableHead>Bill</TableHead>
														<TableHead>Amount</TableHead>
														<TableHead>Status</TableHead>
														<TableHead>Due Date</TableHead>
														<TableHead>Paid Date</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{housemateDebts?.map(({ debt, bill }) => (
														<TableRow key={debt.id}>
															<TableCell className="font-medium">
																{bill.billerName}
															</TableCell>
															<TableCell className="font-mono">
																{formatCurrency(debt.amountOwed)}
															</TableCell>
															<TableCell>
																{debt.isPaid ? (
																	<Badge className="bg-green-100 text-green-800">
																		<IconCheck className="mr-1 h-3 w-3" />
																		Paid
																	</Badge>
																) : (
																	<Badge
																		variant="outline"
																		className="bg-red-50 text-red-800"
																	>
																		<IconX className="mr-1 h-3 w-3" />
																		Unpaid
																	</Badge>
																)}
															</TableCell>
															<TableCell>{formatDate(bill.dueDate)}</TableCell>
															<TableCell>
																{debt.paidAt ? formatDate(debt.paidAt) : "-"}
															</TableCell>
														</TableRow>
													))}
												</TableBody>
											</Table>
										</div>
									)}
								</CardContent>
							</Card>
						</div>
					)}
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setViewDetailsModalOpen(false)}
						>
							Close
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
