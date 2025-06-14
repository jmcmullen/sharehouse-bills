import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
	IconCalendar,
	IconChevronLeft,
	IconChevronRight,
	IconFileText,
	IconPlus,
	IconReceipt,
} from "@tabler/icons-react";
import { DebtTooltip } from "./debt-tooltip";
import { StatusBadge } from "./status-badge";
import type { GroupedBill } from "./types";
import {
	formatCurrency,
	formatDate,
	getAmountPerPerson,
	getDebtSummary,
} from "./utils";

interface BillsTableProps {
	bills: GroupedBill[];
	billsLoading: boolean;
	paginatedBills: GroupedBill[];
	currentPage: number;
	totalPages: number;
	startIndex: number;
	endIndex: number;
	onPrevious: () => void;
	onNext: () => void;
	onMarkPaid: (bill: GroupedBill) => void;
	onDeleteBill: (billId: number) => void;
	onAddBill: () => void;
	processingPayments: boolean;
	deletingBill: boolean;
	billToDelete: number | null;
}

export function BillsTable({
	bills,
	billsLoading,
	paginatedBills,
	currentPage,
	totalPages,
	startIndex,
	endIndex,
	onPrevious,
	onNext,
	onMarkPaid,
	onDeleteBill,
	onAddBill,
	processingPayments,
	deletingBill,
	billToDelete,
}: BillsTableProps) {
	if (billsLoading) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Recent Bills</CardTitle>
				</CardHeader>
				<CardContent className="flex min-h-[400px] flex-col">
					<div className="space-y-3">
						{Array.from({ length: 5 }, (_, i) => (
							<Skeleton
								key={`bill-skeleton-${i + 1}`}
								className="h-12 w-full"
							/>
						))}
					</div>
				</CardContent>
			</Card>
		);
	}

	if (bills.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Recent Bills</CardTitle>
				</CardHeader>
				<CardContent className="flex min-h-[400px] flex-col">
					<div className="py-8 text-center">
						<IconFileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
						<h3 className="mb-2 font-semibold text-lg">No bills found</h3>
						<p className="mb-4 text-muted-foreground">
							Get started by adding your first bill
						</p>
						<Button onClick={onAddBill}>
							<IconPlus className="mr-2 h-4 w-4" />
							Add Your First Bill
						</Button>
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Recent Bills</CardTitle>
			</CardHeader>
			<CardContent className="flex min-h-[400px] flex-col">
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
											<TableCell>
												<StatusBadge status={bill.status} />
											</TableCell>
											<TableCell className="font-mono">
												{formatCurrency(bill.totalAmount)}
											</TableCell>
											<TableCell className="font-mono">
												{formatCurrency(getAmountPerPerson(debts))}
											</TableCell>
											<TableCell>
												<DebtTooltip debtSummary={debtSummary} type="paid">
													<span className="font-medium font-mono text-green-600">
														{formatCurrency(debtSummary.paidAmount)}
													</span>
												</DebtTooltip>
											</TableCell>
											<TableCell>
												<DebtTooltip debtSummary={debtSummary} type="owed">
													<span className="font-medium font-mono text-orange-600">
														{formatCurrency(debtSummary.owedAmount)}
													</span>
												</DebtTooltip>
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
															onClick={() => onMarkPaid({ bill, debts })}
														>
															{processingPayments
																? "Processing..."
																: "Mark Paid"}
														</Button>
													)}
													<Button
														variant="destructive"
														size="sm"
														disabled={deletingBill && billToDelete === bill.id}
														onClick={() => onDeleteBill(bill.id)}
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

				{bills.length > 0 && (
					<div className="mt-4 flex items-center justify-between border-t pt-4">
						<span className="text-muted-foreground text-sm">
							Showing {startIndex + 1} to {Math.min(endIndex, bills.length)} of{" "}
							{bills.length} bills
						</span>
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={onPrevious}
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
								onClick={onNext}
								disabled={currentPage === totalPages}
							>
								Next
								<IconChevronRight className="h-4 w-4" />
							</Button>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
