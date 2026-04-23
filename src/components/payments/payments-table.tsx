import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { IconArrowsExchange, IconReceiptOff } from "@tabler/icons-react";
import type { PaymentListItem } from "./types";
import {
	formatCurrency,
	formatDateTime,
	getAppliedToLabel,
	getPaymentSourceClassName,
	getPaymentSourceLabel,
} from "./utils";

interface PaymentsTableProps {
	payments: PaymentListItem[];
}

export function PaymentsTable({ payments }: PaymentsTableProps) {
	if (payments.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Recent Payments</CardTitle>
				</CardHeader>
				<CardContent className="flex min-h-[320px] flex-col justify-center">
					<div className="py-8 text-center">
						<IconReceiptOff className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
						<h3 className="mb-2 font-semibold text-lg">No payments yet</h3>
						<p className="text-muted-foreground">
							Settled reimbursements will show up here once housemates start
							paying you back.
						</p>
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Recent Payments</CardTitle>
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Date</TableHead>
							<TableHead>Housemate</TableHead>
							<TableHead>Amount</TableHead>
							<TableHead>Source</TableHead>
							<TableHead>Applied To</TableHead>
							<TableHead>Description</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{payments.map((payment) => (
							<TableRow key={payment.id}>
								<TableCell>{formatDateTime(payment.paidAt)}</TableCell>
								<TableCell className="font-medium">
									{payment.housemateName}
								</TableCell>
								<TableCell
									className={
										payment.amount < 0
											? "font-mono text-red-600"
											: "font-mono text-green-600"
									}
								>
									{formatCurrency(payment.amount)}
								</TableCell>
								<TableCell>
									<Badge
										variant="secondary"
										className={getPaymentSourceClassName(payment.source)}
									>
										<IconArrowsExchange className="h-3 w-3" />
										{getPaymentSourceLabel(payment.source)}
									</Badge>
								</TableCell>
								<TableCell>
									<div className="space-y-1">
										<div>{getAppliedToLabel(payment)}</div>
										{payment.creditAmount > 0.009 ? (
											<p className="text-muted-foreground text-xs">
												Includes {formatCurrency(payment.creditAmount)} credit
											</p>
										) : null}
									</div>
								</TableCell>
								<TableCell className="text-muted-foreground">
									{payment.description}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}
