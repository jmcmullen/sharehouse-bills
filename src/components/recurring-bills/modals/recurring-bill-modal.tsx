import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { RecurringBillFormData } from "../types";
import {
	calculateRecurringBillPreview,
	formatCurrency,
	formatDate,
	getFormScheduleSummary,
	getNextDueDatePreview,
} from "../utils";

interface RecurringBillModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	mode: "create" | "edit";
	formData: RecurringBillFormData;
	onFormDataChange: (data: RecurringBillFormData) => void;
	onSubmit: () => void;
	isLoading: boolean;
}

const weekdayOptions = [
	{ value: "0", label: "Sunday" },
	{ value: "1", label: "Monday" },
	{ value: "2", label: "Tuesday" },
	{ value: "3", label: "Wednesday" },
	{ value: "4", label: "Thursday" },
	{ value: "5", label: "Friday" },
	{ value: "6", label: "Saturday" },
];

export function RecurringBillModal({
	open,
	onOpenChange,
	mode,
	formData,
	onFormDataChange,
	onSubmit,
	isLoading,
}: RecurringBillModalProps) {
	const preview = calculateRecurringBillPreview(formData);
	const nextDueDate = getNextDueDatePreview(formData);

	const updateField = <T extends keyof RecurringBillFormData>(
		field: T,
		value: RecurringBillFormData[T],
	) => {
		onFormDataChange({
			...formData,
			[field]: value,
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle>
						{mode === "create" ? "Add Recurring Bill" : "Edit Recurring Bill"}
					</DialogTitle>
					<DialogDescription>
						Configure a template that can generate bills automatically and split
						them across the selected housemates.
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
					<div className="space-y-6">
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="templateName">Template Name</Label>
								<Input
									id="templateName"
									value={formData.templateName}
									onChange={(event) =>
										updateField("templateName", event.target.value)
									}
									placeholder="Weekly Rent"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="billerName">Biller Name</Label>
								<Input
									id="billerName"
									value={formData.billerName}
									onChange={(event) =>
										updateField("billerName", event.target.value)
									}
									placeholder="Landlord"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="totalAmount">Total Amount</Label>
								<Input
									id="totalAmount"
									type="number"
									min="0"
									step="0.01"
									value={formData.totalAmount}
									onChange={(event) =>
										updateField("totalAmount", event.target.value)
									}
									placeholder="1890.00"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="splitStrategy">Split Strategy</Label>
								<Select
									value={formData.splitStrategy}
									onValueChange={(value) =>
										updateField(
											"splitStrategy",
											value as RecurringBillFormData["splitStrategy"],
										)
									}
								>
									<SelectTrigger className="w-full">
										<SelectValue placeholder="Select split strategy" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="equal">Equal split</SelectItem>
										<SelectItem value="custom">Custom amounts</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>

						<div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="frequency">Frequency</Label>
								<Select
									value={formData.frequency}
									onValueChange={(value) =>
										updateField(
											"frequency",
											value as RecurringBillFormData["frequency"],
										)
									}
								>
									<SelectTrigger className="w-full">
										<SelectValue placeholder="Select frequency" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="weekly">Weekly</SelectItem>
										<SelectItem value="monthly">Monthly</SelectItem>
										<SelectItem value="yearly">Yearly</SelectItem>
									</SelectContent>
								</Select>
							</div>

							{formData.frequency === "weekly" ? (
								<div className="space-y-2">
									<Label htmlFor="dayOfWeek">Weekday</Label>
									<Select
										value={formData.dayOfWeek}
										onValueChange={(value) => updateField("dayOfWeek", value)}
									>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="Select weekday" />
										</SelectTrigger>
										<SelectContent>
											{weekdayOptions.map((option) => (
												<SelectItem key={option.value} value={option.value}>
													{option.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							) : null}

							{formData.frequency === "monthly" ? (
								<div className="space-y-2">
									<Label htmlFor="dayOfMonth">Day of Month</Label>
									<Input
										id="dayOfMonth"
										type="number"
										min="1"
										max="31"
										value={formData.dayOfMonth}
										onChange={(event) =>
											updateField("dayOfMonth", event.target.value)
										}
									/>
								</div>
							) : null}

							<div className="space-y-2">
								<Label htmlFor="startDate">Start Date</Label>
								<Input
									id="startDate"
									type="date"
									value={formData.startDate}
									onChange={(event) =>
										updateField("startDate", event.target.value)
									}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="endDate">End Date</Label>
								<Input
									id="endDate"
									type="date"
									value={formData.endDate}
									onChange={(event) =>
										updateField("endDate", event.target.value)
									}
								/>
							</div>
							<div className="flex items-center gap-3 sm:col-span-2">
								<Checkbox
									id="isActive"
									checked={formData.isActive}
									onCheckedChange={(checked) =>
										updateField("isActive", checked === true)
									}
								/>
								<div className="space-y-1">
									<Label htmlFor="isActive">Active</Label>
									<p className="text-muted-foreground text-sm">
										Paused templates stay editable but won&apos;t generate
										bills.
									</p>
								</div>
							</div>
						</div>

						<div className="space-y-4 rounded-lg border p-4">
							<div>
								<h3 className="font-medium">Reminder Defaults</h3>
								<p className="text-muted-foreground text-sm">
									Generated bills copy these reminder settings and can still be
									edited later bill-by-bill.
								</p>
							</div>

							<div className="flex items-start gap-3 rounded-lg border p-4">
								<Checkbox
									id="remindersEnabled"
									checked={formData.remindersEnabled}
									onCheckedChange={(checked) =>
										updateField("remindersEnabled", checked === true)
									}
								/>
								<div className="space-y-1">
									<Label htmlFor="remindersEnabled">Reminders enabled</Label>
									<p className="text-muted-foreground text-sm">
										Disable this if the template should never message
										housemates.
									</p>
								</div>
							</div>

							<div className="grid gap-4 sm:grid-cols-2">
								<div className="space-y-2">
									<Label htmlFor="reminderMode">Reminder mode</Label>
									<Select
										value={formData.reminderMode}
										onValueChange={(value) =>
											updateField(
												"reminderMode",
												value as RecurringBillFormData["reminderMode"],
											)
										}
									>
										<SelectTrigger id="reminderMode" className="w-full">
											<SelectValue placeholder="Select reminder mode" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="individual">Individual</SelectItem>
											<SelectItem value="stacked">Stacked</SelectItem>
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-2">
									<Label htmlFor="overdueCadence">Overdue cadence</Label>
									<Select
										value={formData.overdueCadence}
										onValueChange={(value) =>
											updateField(
												"overdueCadence",
												value as RecurringBillFormData["overdueCadence"],
											)
										}
									>
										<SelectTrigger id="overdueCadence" className="w-full">
											<SelectValue placeholder="Select overdue cadence" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="none">No overdue reminders</SelectItem>
											<SelectItem value="daily">Daily</SelectItem>
											<SelectItem value="weekly">Weekly</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>

							{formData.reminderMode === "individual" ? (
								<div className="space-y-2">
									<Label htmlFor="preDueOffsetsInput">
										Pre-due offsets in days
									</Label>
									<Input
										id="preDueOffsetsInput"
										value={formData.preDueOffsetsInput}
										onChange={(event) =>
											updateField("preDueOffsetsInput", event.target.value)
										}
										placeholder="2, 1, 0"
									/>
									<p className="text-muted-foreground text-sm">
										Comma-separated day offsets before due date, like{" "}
										<code>2, 1, 0</code>.
									</p>
								</div>
							) : (
								<div className="space-y-2">
									<Label htmlFor="stackGroup">Stack group</Label>
									<Input
										id="stackGroup"
										value={formData.stackGroup}
										onChange={(event) =>
											updateField("stackGroup", event.target.value)
										}
										placeholder="utilities"
									/>
								</div>
							)}

							{formData.overdueCadence === "weekly" ? (
								<div className="space-y-2">
									<Label htmlFor="overdueWeekday">Reminder weekday</Label>
									<Select
										value={formData.overdueWeekday}
										onValueChange={(value) =>
											updateField("overdueWeekday", value)
										}
									>
										<SelectTrigger id="overdueWeekday" className="w-full">
											<SelectValue placeholder="Select weekday" />
										</SelectTrigger>
										<SelectContent>
											{weekdayOptions.map((option) => (
												<SelectItem key={option.value} value={option.value}>
													{option.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							) : null}
						</div>

						<div className="space-y-3 rounded-lg border p-4">
							<div>
								<h3 className="font-medium">Housemate Assignments</h3>
								<p className="text-muted-foreground text-sm">
									Included housemates count towards the split. Owners can be
									included so their share is accounted for without creating a
									debt.
								</p>
							</div>
							<div className="space-y-3">
								{formData.assignments.map((assignment, index) => {
									const previewAssignment = preview.assignments.find(
										(item) => item.housemateId === assignment.housemateId,
									);
									return (
										<div
											key={assignment.housemateId}
											className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_auto_auto]"
										>
											<div className="flex items-center gap-3">
												<Checkbox
													id={`assignment-${assignment.housemateId}`}
													checked={assignment.isActive}
													onCheckedChange={(checked) => {
														const nextAssignments = [...formData.assignments];
														nextAssignments[index] = {
															...assignment,
															isActive: checked === true,
														};
														updateField("assignments", nextAssignments);
													}}
												/>
												<div>
													<div className="flex items-center gap-2">
														<Label
															htmlFor={`assignment-${assignment.housemateId}`}
															className="font-medium"
														>
															{assignment.name}
														</Label>
														{assignment.isOwner ? (
															<Badge variant="outline">Owner</Badge>
														) : null}
													</div>
													{assignment.isActive && previewAssignment ? (
														<p className="text-muted-foreground text-sm">
															{assignment.isOwner
																? "Included in the split but no debt created"
																: `Will owe ${formatCurrency(
																		previewAssignment.amountOwed,
																	)}`}
														</p>
													) : (
														<p className="text-muted-foreground text-sm">
															Excluded from this recurring bill
														</p>
													)}
												</div>
											</div>

											{formData.splitStrategy === "custom" ? (
												<div className="space-y-2">
													<Label>Custom Amount</Label>
													<Input
														type="number"
														min="0"
														step="0.01"
														value={assignment.customAmount}
														disabled={
															!assignment.isActive || assignment.isOwner
														}
														onChange={(event) => {
															const nextAssignments = [...formData.assignments];
															nextAssignments[index] = {
																...assignment,
																customAmount: event.target.value,
															};
															updateField("assignments", nextAssignments);
														}}
														placeholder={
															assignment.isOwner ? "Owner share" : "0.00"
														}
													/>
												</div>
											) : (
												<div className="flex items-end justify-end text-muted-foreground text-sm">
													{assignment.isActive
														? preview.amountPerPerson
															? formatCurrency(preview.amountPerPerson)
															: "Included"
														: "Excluded"}
												</div>
											)}
										</div>
									);
								})}
							</div>
						</div>
					</div>

					<div className="space-y-4">
						<Card>
							<CardHeader>
								<CardTitle>Preview</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4 text-sm">
								<div className="space-y-1">
									<p className="text-muted-foreground">Schedule</p>
									<p className="font-medium">
										{getFormScheduleSummary(formData)}
									</p>
								</div>
								<div className="space-y-1">
									<p className="text-muted-foreground">Next due date</p>
									<p className="font-medium">{formatDate(nextDueDate)}</p>
								</div>
								<div className="space-y-1">
									<p className="text-muted-foreground">Included housemates</p>
									<p className="font-medium">{preview.includedCount}</p>
								</div>
								<div className="space-y-1">
									<p className="text-muted-foreground">Debt total</p>
									<p className="font-medium">
										{formatCurrency(preview.nonOwnerTotal)}
									</p>
								</div>
								<div className="space-y-1">
									<p className="text-muted-foreground">Owner share</p>
									<p className="font-medium">
										{formatCurrency(preview.ownerShare)}
									</p>
								</div>
							</CardContent>
						</Card>
					</div>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={onSubmit} disabled={isLoading}>
						{isLoading
							? mode === "create"
								? "Creating..."
								: "Saving..."
							: mode === "create"
								? "Create Recurring Bill"
								: "Save Changes"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
