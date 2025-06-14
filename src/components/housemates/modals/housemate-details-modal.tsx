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
	IconChartPie,
	IconCheck,
	IconCurrencyDollar,
	IconUser,
	IconX,
} from "@tabler/icons-react";
import type { Housemate, HousemateDebt, HousemateStats } from "../types";
import { formatCurrency, formatDate } from "../utils";

interface HousemateDetailsModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	housemate: Housemate | null;
	stats: HousemateStats | null;
	debts: HousemateDebt[];
	statsLoading: boolean;
	debtsLoading: boolean;
}

export function HousemateDetailsModal({
	open,
	onOpenChange,
	housemate,
	stats,
	debts,
	statsLoading,
	debtsLoading,
}: HousemateDetailsModalProps) {
	const renderStatsCards = () => (
		<div className="grid gap-4 md:grid-cols-3">
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="font-medium text-sm">Total Owed</CardTitle>
					<IconCurrencyDollar className="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div className="font-bold text-2xl">
						{statsLoading ? (
							<Skeleton className="h-8 w-20" />
						) : (
							formatCurrency(stats?.totalOwed || 0)
						)}
					</div>
				</CardContent>
			</Card>
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="font-medium text-sm">Total Paid</CardTitle>
					<IconCheck className="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div className="font-bold text-2xl">
						{statsLoading ? (
							<Skeleton className="h-8 w-20" />
						) : (
							formatCurrency(stats?.totalPaid || 0)
						)}
					</div>
				</CardContent>
			</Card>
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="font-medium text-sm">Outstanding</CardTitle>
					<IconChartPie className="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div className="font-bold text-2xl">
						{statsLoading ? (
							<Skeleton className="h-8 w-20" />
						) : (
							formatCurrency(stats?.totalOutstanding || 0)
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);

	const renderPaymentHistory = () => (
		<Card>
			<CardHeader>
				<CardTitle>Payment History</CardTitle>
			</CardHeader>
			<CardContent>
				{debtsLoading ? (
					<div className="space-y-3">
						{Array.from({ length: 3 }, () => (
							<Skeleton key={crypto.randomUUID()} className="h-12 w-full" />
						))}
					</div>
				) : debts.length === 0 ? (
					<div className="py-8 text-center">
						<p className="text-muted-foreground">No payment history found</p>
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
								{debts.map(({ debt, bill }) => (
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
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="!max-w-4xl !w-[70vw] sm:!max-w-4xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<IconUser className="h-5 w-5" />
						{housemate?.name} - Payment Details
					</DialogTitle>
					<DialogDescription>
						Complete payment history and statistics
					</DialogDescription>
				</DialogHeader>

				{housemate && (
					<div className="space-y-6">
						{renderStatsCards()}
						{renderPaymentHistory()}
					</div>
				)}

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Close
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
