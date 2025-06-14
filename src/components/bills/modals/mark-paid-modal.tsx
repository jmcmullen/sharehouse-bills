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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconCheck } from "@tabler/icons-react";
import { useState } from "react";
import type { GroupedBill, PaymentData } from "../types";
import { formatCurrency } from "../utils";

interface MarkPaidModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	billToMarkPaid: GroupedBill | null;
	onConfirm: (payments: PaymentData[]) => void;
	isProcessing: boolean;
}

export function MarkPaidModal({
	open,
	onOpenChange,
	billToMarkPaid,
	onConfirm,
	isProcessing,
}: MarkPaidModalProps) {
	const [paymentAmounts, setPaymentAmounts] = useState<Record<number, string>>(
		{},
	);

	const handleOpenChange = (newOpen: boolean) => {
		if (!newOpen) {
			setPaymentAmounts({});
		}
		onOpenChange(newOpen);
	};

	const handleConfirm = () => {
		if (!billToMarkPaid) return;

		const payments = billToMarkPaid.debts
			.map(({ debt }) => {
				const amount = Number.parseFloat(paymentAmounts[debt.id] || "0");
				return {
					debtId: debt.id,
					amountPaid: amount,
				};
			})
			.filter((payment) => payment !== null);

		onConfirm(payments);
		setPaymentAmounts({});
	};

	if (!billToMarkPaid) return null;

	return (
		<AlertDialog open={open} onOpenChange={handleOpenChange}>
			<AlertDialogContent className="max-w-md">
				<AlertDialogHeader>
					<AlertDialogTitle>Mark Payments</AlertDialogTitle>
					<AlertDialogDescription>
						Enter the amount paid by each person for{" "}
						<span className="font-semibold">
							{billToMarkPaid.bill.billerName}
						</span>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="space-y-4 py-4">
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
											(sum, amount) => sum + Number.parseFloat(amount || "0"),
											0,
										),
									)}
								</span>
							</div>
						</div>
					</div>

					{billToMarkPaid.debts.map(({ debt, housemate }) => {
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
						onClick={handleConfirm}
						disabled={isProcessing}
					>
						{isProcessing ? "Processing..." : "Mark as Paid"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
