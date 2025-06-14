import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	IconCheck,
	IconClock,
	IconCurrencyDollar,
	IconReceipt,
} from "@tabler/icons-react";
import type { BillSummary } from "./types";
import { formatCurrency } from "./utils";

interface SummaryCardsProps {
	summaryData: BillSummary | null;
	summaryLoading: boolean;
}

export function SummaryCards({
	summaryData,
	summaryLoading,
}: SummaryCardsProps) {
	return (
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
	);
}
