import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	IconChartPie,
	IconCoins,
	IconCreditCardPay,
} from "@tabler/icons-react";
import type { PaymentsSummary } from "./types";
import { formatCurrency } from "./utils";

interface PaymentsSummaryCardsProps {
	summary: PaymentsSummary;
}

export function PaymentsSummaryCards({ summary }: PaymentsSummaryCardsProps) {
	return (
		<div className="grid gap-4 md:grid-cols-3">
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="font-medium text-sm">
						Received in Last 30 Days
					</CardTitle>
					<IconCreditCardPay className="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent className="space-y-1">
					<div className="font-bold text-2xl">
						{formatCurrency(summary.recentAmount)}
					</div>
					<p className="text-muted-foreground text-sm">
						{summary.recentCount} recent reimbursement
						{summary.recentCount === 1 ? "" : "s"}
					</p>
				</CardContent>
			</Card>
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="font-medium text-sm">
						Still Owed To You
					</CardTitle>
					<IconChartPie className="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div className="font-bold text-2xl">
						{formatCurrency(summary.outstandingAmount)}
					</div>
				</CardContent>
			</Card>
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="font-medium text-sm">
						Credit On Account
					</CardTitle>
					<IconCoins className="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div className="font-bold text-2xl">
						{formatCurrency(summary.creditBalance)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
