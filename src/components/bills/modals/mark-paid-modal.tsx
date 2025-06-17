import {
	AlertDialog,
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
import { validators } from "@/utils/tanstack-form";
import { IconCheck } from "@tabler/icons-react";
import { useForm } from "@tanstack/react-form";
import { useEffect } from "react";
import type { GroupedBill, PaymentData } from "../types";
import { formatCurrency } from "../utils";

interface MarkPaidModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	billToMarkPaid: GroupedBill | null;
	onConfirm: (payments: PaymentData[]) => void;
	isProcessing: boolean;
}

type FormData = Record<string, number>;

export function MarkPaidModal({
	open,
	onOpenChange,
	billToMarkPaid,
	onConfirm,
	isProcessing,
}: MarkPaidModalProps) {
	const form = useForm({
		defaultValues: {} as FormData,
		onSubmit: async ({ value }) => {
			if (!billToMarkPaid) return;

			const payments = billToMarkPaid.debts.map(({ debt }) => {
				const amount = value[`debt-${debt.id}`] || 0;
				return {
					debtId: debt.id,
					amountPaid: amount,
				};
			});

			onConfirm(payments);
			form.reset();
		},
	});

	// Initialize form values when modal opens with bill data
	useEffect(() => {
		if (open && billToMarkPaid) {
			const defaultValues: FormData = {};
			for (const { debt } of billToMarkPaid.debts) {
				// If already paid, they paid the full amount; if unpaid, they haven't paid anything yet
				defaultValues[`debt-${debt.id}`] = debt.isPaid
					? Number(debt.amountOwed.toFixed(2))
					: 0;
			}
			form.reset(defaultValues);
		}
	}, [open, billToMarkPaid, form]);

	const handleOpenChange = (newOpen: boolean) => {
		if (!newOpen) {
			form.reset();
		}
		onOpenChange(newOpen);
	};

	if (!billToMarkPaid) return null;

	return (
		<AlertDialog open={open} onOpenChange={handleOpenChange}>
			<AlertDialogContent className="max-w-md">
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						void form.handleSubmit();
					}}
				>
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
								<form.Subscribe selector={(state) => state.values}>
									{(values) => (
										<div className="flex justify-between">
											<span>Total Entered:</span>
											<span className="font-mono">
												{formatCurrency(
													Object.values(values).reduce(
														(sum, amount) => sum + (Number(amount) || 0),
														0,
													),
												)}
											</span>
										</div>
									)}
								</form.Subscribe>
							</div>
						</div>

						{billToMarkPaid.debts.map(({ debt, housemate }) => {
							const maxAmount = debt.amountOwed;
							const isPaid = debt.isPaid;
							const fieldName = `debt-${debt.id}`;

							return (
								<form.Field
									key={debt.id}
									name={fieldName}
									validators={{
										onChange: validators.number(0, Number(maxAmount.toFixed(2)))
											.onChange,
									}}
								>
									{(field) => (
										<div className="space-y-2">
											<Label
												htmlFor={fieldName}
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
													id={fieldName}
													type="number"
													step="0.01"
													min="0"
													max={maxAmount.toFixed(2)}
													value={field.state.value || ""}
													onChange={(e) =>
														field.handleChange(Number(e.target.value))
													}
													onBlur={field.handleBlur}
													placeholder="0.00"
												/>
												<Button
													type="button"
													variant="outline"
													onClick={() => {
														field.handleChange(Number(maxAmount.toFixed(2)));
													}}
												>
													Max
												</Button>
											</div>
											{field.state.meta.errors.map((error) => (
												<p key={error} className="text-red-500 text-sm">
													{error}
												</p>
											))}
										</div>
									)}
								</form.Field>
							);
						})}
					</div>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<form.Subscribe>
							{(state) => (
								<Button
									type="submit"
									className="bg-green-600 hover:bg-green-700"
									disabled={
										!state.canSubmit || state.isSubmitting || isProcessing
									}
								>
									{state.isSubmitting || isProcessing
										? "Processing..."
										: "Mark as Paid"}
								</Button>
							)}
						</form.Subscribe>
					</AlertDialogFooter>
				</form>
			</AlertDialogContent>
		</AlertDialog>
	);
}
