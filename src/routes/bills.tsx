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
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { deleteBill, getAllBills, markDebtPaid } from "@/functions/bills";
import {
	IconAlertCircle,
	IconCalendar,
	IconCheck,
	IconChevronLeft,
	IconChevronRight,
	IconClock,
	IconCurrencyDollar,
	IconFileText,
	IconPlus,
	IconReceipt,
} from "@tabler/icons-react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface BillData {
	bill: {
		id: number;
		totalAmount: number;
		billerName: string;
		dueDate: string;
		status: string;
	};
	debt?: {
		id: number;
		amountOwed: number;
		isPaid: boolean;
	} | null;
	housemate?: {
		name: string;
	} | null;
}

// Helper function to calculate summary from bills data
function calculateSummary(billsData: BillData[]) {
	if (!billsData || billsData.length === 0) {
		return {
			totalBills: 0,
			totalAmount: 0,
			totalUnpaid: 0,
			unpaidCount: 0,
			paidAmount: 0,
			outstandingAmount: 0,
		};
	}

	// Group by bill ID to avoid double counting
	const billsMap = new Map();
	const allDebts: BillData["debt"][] = [];

	for (const row of billsData) {
		if (!billsMap.has(row.bill.id)) {
			billsMap.set(row.bill.id, row.bill);
		}
		if (row.debt) {
			allDebts.push(row.debt);
		}
	}

	const totalBills = billsMap.size;
	const totalAmount = Array.from(billsMap.values()).reduce(
		(sum, bill) => sum + bill.totalAmount,
		0,
	);

	const unpaidDebts = allDebts.filter((debt) => !debt?.isPaid);
	const paidDebts = allDebts.filter((debt) => debt?.isPaid);

	const totalUnpaid = unpaidDebts.reduce(
		(sum, debt) => sum + (debt?.amountOwed || 0),
		0,
	);
	const paidAmount = paidDebts.reduce(
		(sum, debt) => sum + (debt?.amountOwed || 0),
		0,
	);

	return {
		totalBills,
		totalAmount,
		totalUnpaid,
		unpaidCount: unpaidDebts.length,
		paidAmount,
		outstandingAmount: totalUnpaid,
	};
}

export const Route = createFileRoute("/bills")({
	beforeLoad: async ({ context }) => {
		// Redirect to login if not authenticated (session checked in root)
		if (!context.session?.user) {
			throw redirect({
				to: "/login",
			});
		}
	},
	// Data will be loaded client-side to avoid server/client boundary issues
	component: RouteComponent,
});

function RouteComponent() {
	// Data state
	const [billsData, setBillsData] = useState<BillData[]>([]);
	const [billsLoading, setBillsLoading] = useState(true);
	const [billsError, setBillsError] = useState<Error | null>(null);

	// Pagination state
	const [currentPage, setCurrentPage] = useState(1);
	const itemsPerPage = 20; // Fixed at 20 items per page

	// Delete modal state
	const [deleteModalOpen, setDeleteModalOpen] = useState(false);
	const [billToDelete, setBillToDelete] = useState<number | null>(null);
	const [deletingBill, setDeletingBill] = useState(false);

	// Mark paid modal state
	const [markPaidModalOpen, setMarkPaidModalOpen] = useState(false);
	const [billToMarkPaid, setBillToMarkPaid] = useState<{
		bill: BillData["bill"];
		debts: Array<{
			debt: NonNullable<BillData["debt"]>;
			housemate: NonNullable<BillData["housemate"]>;
		}>;
	} | null>(null);
	const [paymentAmounts, setPaymentAmounts] = useState<Record<number, string>>(
		{},
	);
	const [processingPayments, setProcessingPayments] = useState(false);

	// Add bill modal state
	const [addBillModalOpen, setAddBillModalOpen] = useState(false);
	const [uploadingBill, setUploadingBill] = useState(false);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [uploadResult, setUploadResult] = useState<{
		success: boolean;
		message: string;
		billId?: number;
		error?: string;
	} | null>(null);

	// Load bills data
	const loadBills = useCallback(async () => {
		try {
			setBillsLoading(true);
			setBillsError(null);
			const data = await getAllBills();
			setBillsData(data);
		} catch (error) {
			setBillsError(
				error instanceof Error ? error : new Error("Failed to load bills"),
			);
		} finally {
			setBillsLoading(false);
		}
	}, []);

	useEffect(() => {
		loadBills();
	}, [loadBills]);

	// Summary data will be calculated from bills data
	const summaryData = billsData ? calculateSummary(billsData) : null;
	const summaryLoading = billsLoading;
	const summaryError = billsError;

	// Delete bill function
	const handleDeleteBill = async (billId: number) => {
		try {
			setDeletingBill(true);
			await deleteBill({ data: { billId } });

			// Remove bill from local state
			setBillsData((prev) => prev.filter((row) => row.bill.id !== billId));

			setDeleteModalOpen(false);
			setBillToDelete(null);

			toast.success("Bill deleted successfully", {
				description: "The bill and all associated debts have been removed.",
			});
		} catch (error) {
			console.error("Failed to delete bill:", error);
			toast.error("Failed to delete bill", {
				description:
					error instanceof Error
						? error.message
						: "An unexpected error occurred. Please try again.",
			});
		} finally {
			setDeletingBill(false);
		}
	};

	// Mark debt paid function
	const handleMarkPaid = async (
		payments: Array<{ debtId: number; amountPaid: number }>,
	) => {
		if (!billToMarkPaid) return;

		try {
			setProcessingPayments(true);

			// Process each payment
			await Promise.all(
				payments.map((payment) =>
					markDebtPaid({
						data: {
							debtId: payment.debtId,
							isPaid: payment.amountPaid > 0,
						},
					}),
				),
			);

			// Reload bills data to get updated state
			await loadBills();

			setMarkPaidModalOpen(false);
			setBillToMarkPaid(null);
			setPaymentAmounts({});

			toast.success("Payments updated successfully", {
				description: "The bill payment status has been updated.",
			});
		} catch (error) {
			console.error("Failed to update payments:", error);
			toast.error("Failed to update payments", {
				description:
					error instanceof Error ? error.message : "Please try again.",
			});
		} finally {
			setProcessingPayments(false);
		}
	};

	// Handle PDF upload and processing
	const handleAddBill = async () => {
		if (!selectedFile) {
			toast.error("No file selected", {
				description: "Please select a PDF file to upload.",
			});
			return;
		}

		setUploadingBill(true);
		setUploadResult(null);

		const formData = new FormData();
		formData.append("attachment1", selectedFile);
		// Add required fields for the webhook to work
		formData.append("from", "manual@upload.com");
		formData.append("subject", "Manual Bill Upload");
		formData.append("attachments", "1");

		try {
			const response = await fetch("/api/email-webhook", {
				method: "POST",
				body: formData,
			});

			const data = await response.json();

			if (response.ok) {
				// Refresh the bills data
				await loadBills();

				toast.success("Bill created successfully", {
					description: "Your bill has been processed and added to the system.",
				});

				// Reset state and close modal
				setSelectedFile(null);
				setUploadResult(null);
				setAddBillModalOpen(false);
			} else {
				setUploadResult({
					success: false,
					message: "Processing failed",
					error: data.error || "Unknown error",
				});

				toast.error("Failed to process bill", {
					description:
						data.error || "An error occurred while processing your bill.",
				});
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : "Network error";
			setUploadResult({
				success: false,
				message: "Processing failed",
				error: errorMessage,
			});

			toast.error("Failed to upload bill", {
				description: errorMessage,
			});
		} finally {
			setUploadingBill(false);
		}
	};

	if (billsError || summaryError) {
		return (
			<div className="flex min-h-[400px] items-center justify-center">
				<div className="space-y-4 text-center">
					<IconAlertCircle className="mx-auto h-12 w-12 text-muted-foreground" />
					<div>
						<h3 className="font-semibold text-lg">Error loading bills</h3>
						<p className="text-muted-foreground">
							{billsError?.message ||
								summaryError?.message ||
								"Something went wrong"}
						</p>
					</div>
				</div>
			</div>
		);
	}

	// Group bills data by bill for easier rendering
	const groupedBills =
		billsData?.reduce(
			(acc, row) => {
				const billId = row.bill.id;
				if (!acc[billId]) {
					acc[billId] = {
						bill: row.bill,
						debts: [],
					};
				}
				if (row.debt && row.housemate) {
					acc[billId].debts.push({
						debt: row.debt,
						housemate: row.housemate,
					});
				}
				return acc;
			},
			{} as Record<
				number,
				{
					bill: (typeof billsData)[0]["bill"];
					debts: {
						debt: (typeof billsData)[0]["debt"];
						housemate: (typeof billsData)[0]["housemate"];
					}[];
				}
			>,
		) || {};

	const bills = Object.values(groupedBills);

	// Pagination logic
	const totalPages = Math.ceil(bills.length / itemsPerPage);
	const startIndex = (currentPage - 1) * itemsPerPage;
	const endIndex = startIndex + itemsPerPage;
	const paginatedBills = bills.slice(startIndex, endIndex);

	// Calculate amount per person for bills
	const getAmountPerPerson = (
		debts: Array<{ debt: BillData["debt"]; housemate: BillData["housemate"] }>,
	) => {
		if (!debts || debts.length === 0) return 0;
		return debts[0]?.debt?.amountOwed || 0;
	};

	// Calculate debt summary
	const getDebtSummary = (
		debts: Array<{ debt: BillData["debt"]; housemate: BillData["housemate"] }>,
	) => {
		const paid = debts.filter((d) => d.debt?.isPaid).length;
		const total = debts.length;
		const paidAmount = debts
			.filter((d) => d.debt?.isPaid)
			.reduce((sum, d) => sum + (d.debt?.amountOwed || 0), 0);
		const owedAmount = debts
			.filter((d) => !d.debt?.isPaid)
			.reduce((sum, d) => sum + (d.debt?.amountOwed || 0), 0);

		return { paid, total, paidAmount, owedAmount, debts };
	};

	const getStatusBadge = (status: string) => {
		switch (status) {
			case "paid":
				return (
					<Badge
						variant="default"
						className="border border-green-200 bg-green-100 text-green-800 dark:border-green-600 dark:bg-green-900 dark:text-green-200"
					>
						<IconCheck className="mr-1 h-3 w-3" />
						Paid
					</Badge>
				);
			case "partially_paid":
				return (
					<Badge
						variant="secondary"
						className="border border-yellow-200 bg-yellow-100 text-yellow-800 dark:border-yellow-600 dark:bg-yellow-900 dark:text-yellow-200"
					>
						<IconClock className="mr-1 h-3 w-3" />
						Partially Paid
					</Badge>
				);
			default:
				return (
					<Badge
						variant="outline"
						className="border-red-200 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-300"
					>
						<IconAlertCircle className="mr-1 h-3 w-3" />
						Pending
					</Badge>
				);
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

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="font-bold text-3xl">Bills</h1>
					<p className="text-muted-foreground">
						Manage household bills and track payments
					</p>
				</div>
				<Button onClick={() => setAddBillModalOpen(true)}>
					<IconPlus className="mr-2 h-4 w-4" />
					Add Bill
				</Button>
			</div>

			{/* Summary Cards */}
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="font-medium text-sm">Total Bills</CardTitle>
						<IconReceipt className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="font-bold text-2xl">
							{summaryLoading ? (
								<Skeleton className="h-8 w-16" />
							) : (
								summaryData?.totalBills || 0
							)}
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="font-medium text-sm">Total Amount</CardTitle>
						<IconCurrencyDollar className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="font-bold text-2xl">
							{summaryLoading ? (
								<Skeleton className="h-8 w-20" />
							) : (
								formatCurrency(summaryData?.totalAmount || 0)
							)}
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="font-medium text-sm">Paid Amount</CardTitle>
						<IconCheck className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="font-bold text-2xl">
							{summaryLoading ? (
								<Skeleton className="h-8 w-20" />
							) : (
								formatCurrency(summaryData?.paidAmount || 0)
							)}
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="font-medium text-sm">Outstanding</CardTitle>
						<IconClock className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="font-bold text-2xl">
							{summaryLoading ? (
								<Skeleton className="h-8 w-20" />
							) : (
								formatCurrency(summaryData?.outstandingAmount || 0)
							)}
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Bills Table */}
			<Card>
				<CardHeader>
					<CardTitle>Recent Bills</CardTitle>
				</CardHeader>
				<CardContent className="flex min-h-[400px] flex-col">
					{billsLoading ? (
						<div className="space-y-3">
							{[
								"bill-skeleton-1",
								"bill-skeleton-2",
								"bill-skeleton-3",
								"bill-skeleton-4",
								"bill-skeleton-5",
							].map((key) => (
								<Skeleton key={key} className="h-12 w-full" />
							))}
						</div>
					) : bills.length === 0 ? (
						<div className="py-8 text-center">
							<IconFileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
							<h3 className="mb-2 font-semibold text-lg">No bills found</h3>
							<p className="mb-4 text-muted-foreground">
								Get started by adding your first bill
							</p>
							<Button onClick={() => setAddBillModalOpen(true)}>
								<IconPlus className="mr-2 h-4 w-4" />
								Add Your First Bill
							</Button>
						</div>
					) : (
						<>
							<div className="flex-1">
								<TooltipProvider>
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Biller</TableHead>
												<TableHead>Status</TableHead>
												<TableHead>Total Amount</TableHead>
												<TableHead>Per Person</TableHead>
												<TableHead>Paid</TableHead>
												<TableHead>Owed</TableHead>
												<TableHead>Due Date</TableHead>
												<TableHead className="text-right">Actions</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{paginatedBills.map(({ bill, debts }) => {
												const debtSummary = getDebtSummary(debts);
												return (
													<TableRow key={bill.id}>
														<TableCell className="font-medium">
															<div className="flex items-center gap-2">
																<IconReceipt className="h-4 w-4 text-muted-foreground" />
																{bill.billerName}
															</div>
														</TableCell>
														<TableCell>{getStatusBadge(bill.status)}</TableCell>
														<TableCell className="font-mono">
															{formatCurrency(bill.totalAmount)}
														</TableCell>
														<TableCell className="font-mono">
															{formatCurrency(getAmountPerPerson(debts))}
														</TableCell>
														<TableCell>
															<Tooltip>
																<TooltipTrigger asChild>
																	<div className="cursor-help">
																		<span className="font-medium font-mono text-green-600">
																			{formatCurrency(debtSummary.paidAmount)}
																		</span>
																	</div>
																</TooltipTrigger>
																<TooltipContent>
																	<div className="space-y-1">
																		<p className="font-semibold">
																			Paid ({debtSummary.paid}/
																			{debtSummary.total})
																		</p>
																		{debtSummary.debts
																			.filter((d) => d.debt?.isPaid)
																			.map(({ debt, housemate }) => (
																				<div
																					key={debt.id}
																					className="flex justify-between gap-4 text-sm"
																				>
																					<span>{housemate.name}</span>
																					<span className="font-mono">
																						{formatCurrency(debt.amountOwed)}
																					</span>
																				</div>
																			))}
																	</div>
																</TooltipContent>
															</Tooltip>
														</TableCell>
														<TableCell>
															<Tooltip>
																<TooltipTrigger asChild>
																	<div className="cursor-help">
																		<span className="font-medium font-mono text-orange-600">
																			{formatCurrency(debtSummary.owedAmount)}
																		</span>
																	</div>
																</TooltipTrigger>
																<TooltipContent>
																	<div className="space-y-1">
																		<p className="font-semibold">
																			Owed (
																			{debtSummary.total - debtSummary.paid}/
																			{debtSummary.total})
																		</p>
																		{debtSummary.debts
																			.filter((d) => !d.debt?.isPaid)
																			.map(({ debt, housemate }) => (
																				<div
																					key={debt.id}
																					className="flex justify-between gap-4 text-sm"
																				>
																					<span>{housemate.name}</span>
																					<span className="font-mono">
																						{formatCurrency(debt.amountOwed)}
																					</span>
																				</div>
																			))}
																	</div>
																</TooltipContent>
															</Tooltip>
														</TableCell>
														<TableCell>
															<div className="flex items-center gap-2">
																<IconCalendar className="h-4 w-4 text-muted-foreground" />
																{formatDate(bill.dueDate)}
															</div>
														</TableCell>
														<TableCell className="text-right">
															<div className="flex items-center justify-end gap-2">
																{bill.status !== "paid" && (
																	<Button
																		variant="default"
																		size="sm"
																		className="bg-green-600 hover:bg-green-700"
																		disabled={processingPayments}
																		onClick={() => {
																			setBillToMarkPaid({ bill, debts });
																			// Initialize payment amounts - 0 for unpaid, full amount for paid
																			const initialAmounts: Record<
																				number,
																				string
																			> = {};
																			for (const { debt } of debts) {
																				if (debt) {
																					if (debt.isPaid) {
																						initialAmounts[debt.id] =
																							debt.amountOwed.toString();
																					} else {
																						initialAmounts[debt.id] = "0";
																					}
																				}
																			}
																			setPaymentAmounts(initialAmounts);
																			setMarkPaidModalOpen(true);
																		}}
																	>
																		{processingPayments
																			? "Processing..."
																			: "Mark Paid"}
																	</Button>
																)}
																<Button
																	variant="destructive"
																	size="sm"
																	disabled={
																		deletingBill && billToDelete === bill.id
																	}
																	onClick={() => {
																		setBillToDelete(bill.id);
																		setDeleteModalOpen(true);
																	}}
																>
																	{deletingBill && billToDelete === bill.id
																		? "Deleting..."
																		: "Delete"}
																</Button>
															</div>
														</TableCell>
													</TableRow>
												);
											})}
										</TableBody>
									</Table>
								</TooltipProvider>
							</div>

							{/* Pagination */}
							{bills.length > 0 && (
								<div className="mt-4 flex items-center justify-between border-t pt-4">
									<span className="text-muted-foreground text-sm">
										Showing {startIndex + 1} to{" "}
										{Math.min(endIndex, bills.length)} of {bills.length} bills
									</span>
									<div className="flex items-center gap-2">
										<Button
											variant="outline"
											size="sm"
											onClick={() =>
												setCurrentPage(Math.max(1, currentPage - 1))
											}
											disabled={currentPage === 1}
										>
											<IconChevronLeft className="h-4 w-4" />
											Previous
										</Button>
										<span className="text-muted-foreground text-sm">
											Page {currentPage} of {totalPages}
										</span>
										<Button
											variant="outline"
											size="sm"
											onClick={() =>
												setCurrentPage(Math.min(totalPages, currentPage + 1))
											}
											disabled={currentPage === totalPages}
										>
											Next
											<IconChevronRight className="h-4 w-4" />
										</Button>
									</div>
								</div>
							)}
						</>
					)}
				</CardContent>
			</Card>

			{/* Delete Confirmation Modal */}
			<AlertDialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete Bill</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete this bill? This action cannot be
							undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-red-600 hover:bg-red-700"
							onClick={() => {
								if (billToDelete) {
									handleDeleteBill(billToDelete);
								}
							}}
							disabled={deletingBill}
						>
							{deletingBill ? "Deleting..." : "Delete"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Mark Paid Modal */}
			<AlertDialog open={markPaidModalOpen} onOpenChange={setMarkPaidModalOpen}>
				<AlertDialogContent className="max-w-md">
					<AlertDialogHeader>
						<AlertDialogTitle>Mark Payments</AlertDialogTitle>
						<AlertDialogDescription>
							Enter the amount paid by each person for{" "}
							<span className="font-semibold">
								{billToMarkPaid?.bill?.billerName}
							</span>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<div className="space-y-4 py-4">
						{billToMarkPaid && (
							<div className="rounded-lg bg-muted/50 p-3">
								<div className="space-y-1 text-sm">
									<div className="flex justify-between">
										<span>Total Bill:</span>
										<span className="font-mono">
											{formatCurrency(billToMarkPaid.bill.totalAmount)}
										</span>
									</div>
									<div className="flex justify-between">
										<span>Total Entered:</span>
										<span className="font-mono">
											{formatCurrency(
												Object.values(paymentAmounts).reduce(
													(sum, amount) =>
														sum + Number.parseFloat(amount || "0"),
													0,
												),
											)}
										</span>
									</div>
								</div>
							</div>
						)}
						{billToMarkPaid?.debts.map(({ debt, housemate }) => {
							if (!debt || !housemate) return null;

							const maxAmount = debt.amountOwed;
							const currentAmount = paymentAmounts[debt.id] || "0";
							const isPaid = debt.isPaid;

							return (
								<div key={debt.id} className="space-y-2">
									<Label
										htmlFor={`payment-${debt.id}`}
										className="flex items-center gap-2"
									>
										{housemate.name} (max: {formatCurrency(maxAmount)})
										{isPaid && (
											<Badge variant="secondary" className="text-xs">
												<IconCheck className="mr-1 h-3 w-3" />
												Paid
											</Badge>
										)}
									</Label>
									<div className="flex gap-2">
										<Input
											id={`payment-${debt.id}`}
											type="number"
											step="0.01"
											min="0"
											max={maxAmount}
											value={currentAmount}
											onChange={(e) => {
												const value = e.target.value;
												setPaymentAmounts((prev) => ({
													...prev,
													[debt.id]: value,
												}));
											}}
											placeholder="0.00"
										/>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => {
												setPaymentAmounts((prev) => ({
													...prev,
													[debt.id]: maxAmount.toString(),
												}));
											}}
											className="shrink-0"
										>
											Max
										</Button>
									</div>
								</div>
							);
						})}
					</div>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-green-600 hover:bg-green-700"
							onClick={() => {
								if (!billToMarkPaid) return;

								// Prepare payment data
								const payments = billToMarkPaid.debts
									.map(({ debt }) => {
										if (!debt) return null;
										const amount = Number.parseFloat(
											paymentAmounts[debt.id] || "0",
										);
										return {
											debtId: debt.id,
											amountPaid: amount,
										};
									})
									.filter((payment) => payment !== null);

								handleMarkPaid(payments);
							}}
							disabled={processingPayments}
						>
							{processingPayments ? "Processing..." : "Mark as Paid"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Add Bill Modal */}
			<AlertDialog open={addBillModalOpen} onOpenChange={setAddBillModalOpen}>
				<AlertDialogContent className="max-w-lg">
					<AlertDialogHeader>
						<AlertDialogTitle>Add New Bill</AlertDialogTitle>
						<AlertDialogDescription>
							Upload a bill to automatically extract details and split costs
							among all active housemates.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<div className="space-y-4 py-4">
						<div>
							<Label htmlFor="billPdf" className="font-medium text-sm">
								Bill File
							</Label>
							<div className="mt-2">
								{selectedFile ? (
									<div className="rounded-lg border-2 border-green-300 border-dashed bg-green-50 p-6 text-center dark:border-green-600 dark:bg-green-950">
										<div className="space-y-2">
											<div className="flex items-center justify-center">
												<IconFileText className="h-8 w-8 text-green-600" />
											</div>
											<p className="font-medium text-green-600 text-sm">
												{selectedFile.name}
											</p>
											<p className="text-muted-foreground text-xs">
												{(selectedFile.size / 1024 / 1024).toFixed(2)} MB
											</p>
											<Button
												type="button"
												variant="outline"
												size="sm"
												onClick={() => {
													setSelectedFile(null);
													setUploadResult(null);
												}}
												disabled={uploadingBill}
											>
												Remove
											</Button>
										</div>
									</div>
								) : (
									<div className="relative">
										<Input
											id="billPdf"
											type="file"
											accept=".pdf"
											onChange={(e) => {
												const file = e.target.files?.[0];
												if (file) {
													if (file.type === "application/pdf") {
														setSelectedFile(file);
														setUploadResult(null);
													} else {
														toast.error("Invalid file type", {
															description:
																"Please select a valid bill file (PDF format).",
														});
														e.target.value = "";
													}
												}
											}}
											disabled={uploadingBill}
											className="hidden"
										/>
										<Label
											htmlFor="billPdf"
											className="block cursor-pointer rounded-lg border-2 border-border border-dashed bg-muted/20 p-6 text-center transition-colors hover:border-border/70 hover:bg-muted/40"
										>
											<div className="space-y-2">
												<div className="flex items-center justify-center">
													<IconPlus className="h-8 w-8 text-muted-foreground" />
												</div>
												<div>
													<p className="font-medium text-sm">
														Click to select your bill
													</p>
													<p className="text-muted-foreground text-xs">
														Supports PDF files up to 10MB
													</p>
												</div>
											</div>
										</Label>
									</div>
								)}
							</div>
						</div>

						{uploadResult && (
							<div
								className={`rounded-lg p-3 ${uploadResult.success ? "bg-green-50 dark:bg-green-950" : "bg-red-50 dark:bg-red-950"}`}
							>
								<p
									className={`text-sm ${uploadResult.success ? "text-green-800 dark:text-green-200" : "text-red-800 dark:text-red-200"}`}
								>
									{uploadResult.success ? "✅ " : "❌ "}
									{uploadResult.message}
									{uploadResult.error && `: ${uploadResult.error}`}
								</p>
							</div>
						)}

						<div className="flex gap-2 pt-4">
							<AlertDialogCancel asChild>
								<Button
									type="button"
									variant="outline"
									className="flex-1"
									disabled={uploadingBill}
									onClick={() => {
										setUploadResult(null);
										setSelectedFile(null);
									}}
								>
									Cancel
								</Button>
							</AlertDialogCancel>
							<Button
								onClick={handleAddBill}
								className="flex-1"
								disabled={uploadingBill || !selectedFile}
							>
								{uploadingBill ? (
									<>
										<span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-white border-b-2" />
										Processing...
									</>
								) : (
									"Upload & Process"
								)}
							</Button>
						</div>
					</div>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
