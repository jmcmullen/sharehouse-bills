// fallow-ignore-file code-duplication
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
	IconBell,
	IconBellOff,
	IconCalendar,
	IconChevronLeft,
	IconChevronRight,
	IconDotsVertical,
	IconEye,
	IconFileText,
	IconLink,
	IconPlus,
	IconReceipt,
	IconTrash,
} from "@tabler/icons-react";
import { DebtTooltip } from "./debt-tooltip";
import { StatusBadge } from "./status-badge";
import type { GroupedBill } from "./types";
import {
	formatCurrency,
	formatDate,
	getAmountPerPerson,
	getDebtSummary,
	getReminderSummaryLabel,
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
	onDeleteBill: (billId: string) => void;
	onViewPdf: (bill: GroupedBill) => void;
	onEditReminders: (bill: GroupedBill) => void;
	onAddBill: () => void;
	processingPayments: boolean;
	deletingBill: boolean;
	billToDelete: string | null;
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
	onViewPdf,
	onEditReminders,
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
									<TableHead className="text-right">Total Amount</TableHead>
									<TableHead className="text-right">Per Person</TableHead>
									<TableHead className="text-right">Paid</TableHead>
									<TableHead className="text-right">Owed</TableHead>
									<TableHead>Due Date</TableHead>
									<TableHead className="text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{paginatedBills.map(({ bill, debts }) => {
									const debtSummary = getDebtSummary(debts);
									return (
										<TableRow
											key={bill.id}
											className="transition-colors hover:bg-primary/5"
										>
											<TableCell className="whitespace-normal font-medium">
												<div className="flex min-w-0 items-center gap-2">
													<IconReceipt className="h-4 w-4 shrink-0 text-muted-foreground" />
													<div className="flex min-w-0 items-center gap-2">
														<span
															className="min-w-0 max-w-[40ch] truncate"
															title={bill.billerName}
														>
															{bill.billerName}
														</span>
														<Tooltip>
															<TooltipTrigger asChild>
																<span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
																	{bill.remindersEnabled ? (
																		<>
																			<IconBell className="h-3 w-3" />
																			{bill.preDueOffsetsDays.length}
																		</>
																	) : (
																		<IconBellOff className="h-3 w-3" />
																	)}
																</span>
															</TooltipTrigger>
															<TooltipContent>
																{bill.remindersEnabled
																	? getReminderSummaryLabel(bill)
																	: "Reminders off"}
															</TooltipContent>
														</Tooltip>
													</div>
												</div>
											</TableCell>
											<TableCell>
												<StatusBadge status={bill.status} />
											</TableCell>
											<TableCell className="text-right font-mono">
												{formatCurrency(bill.totalAmount)}
											</TableCell>
											<TableCell className="text-right font-mono">
												{formatCurrency(getAmountPerPerson(debts))}
											</TableCell>
											<TableCell className="text-right">
												<DebtTooltip debtSummary={debtSummary} type="paid">
													<span className="font-medium font-mono text-green-600">
														{formatCurrency(debtSummary.paidAmount)}
													</span>
												</DebtTooltip>
											</TableCell>
											<TableCell className="text-right">
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
												<div className="flex items-center justify-end gap-1">
													{bill.status !== "paid" &&
														debtSummary.owedAmount > 0 && (
															<Button
																variant="default"
																size="sm"
																disabled={processingPayments}
																onClick={() => onMarkPaid({ bill, debts })}
															>
																{processingPayments
																	? "Processing..."
																	: "Mark Paid"}
															</Button>
														)}
													<DropdownMenu>
														<DropdownMenuTrigger asChild>
															<Button
																variant="ghost"
																size="icon"
																className="h-8 w-8"
															>
																<IconDotsVertical className="h-4 w-4" />
																<span className="sr-only">More actions</span>
															</Button>
														</DropdownMenuTrigger>
														<DropdownMenuContent align="end">
															<DropdownMenuItem asChild>
																<a href={bill.publicPath ?? `/bill/${bill.id}`}>
																	<IconLink className="h-4 w-4" />
																	View bill
																</a>
															</DropdownMenuItem>
															{bill.pdfUrl && bill.pdfSha256 ? (
																<DropdownMenuItem
																	onClick={() => onViewPdf({ bill, debts })}
																>
																	<IconEye className="h-4 w-4" />
																	View PDF
																</DropdownMenuItem>
															) : null}
															<DropdownMenuItem
																onClick={() => onEditReminders({ bill, debts })}
															>
																<IconBell className="h-4 w-4" />
																Reminders
															</DropdownMenuItem>
															<DropdownMenuSeparator />
															<DropdownMenuItem
																variant="destructive"
																disabled={
																	deletingBill && billToDelete === bill.id
																}
																onClick={() => onDeleteBill(bill.id)}
															>
																<IconTrash className="h-4 w-4" />
																Delete
															</DropdownMenuItem>
														</DropdownMenuContent>
													</DropdownMenu>
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
