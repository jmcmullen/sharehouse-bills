import { Button } from "@/components/ui/button";
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
import type { BillReminderFormData, GroupedBill } from "../types";
import { reminderWeekdayOptions } from "../utils";

interface BillReminderSettingsModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	bill: GroupedBill | null;
	formData: BillReminderFormData;
	onFormDataChange: (value: BillReminderFormData) => void;
	onSubmit: () => void;
	isSaving: boolean;
}

export function BillReminderSettingsModal({
	open,
	onOpenChange,
	bill,
	formData,
	onFormDataChange,
	onSubmit,
	isSaving,
}: BillReminderSettingsModalProps) {
	const updateField = <T extends keyof BillReminderFormData>(
		field: T,
		value: BillReminderFormData[T],
	) => {
		onFormDataChange({
			...formData,
			[field]: value,
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Reminder Settings</DialogTitle>
					<DialogDescription>
						{bill
							? `Choose how ${bill.bill.billerName} should remind housemates.`
							: "Update reminder behaviour for this bill."}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-5">
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
								Turn bill reminders on or off without changing the bill itself.
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
										value as BillReminderFormData["reminderMode"],
									)
								}
							>
								<SelectTrigger id="reminderMode">
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
										value as BillReminderFormData["overdueCadence"],
									)
								}
							>
								<SelectTrigger id="overdueCadence">
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
								Comma-separated day offsets before the due date. Example:{" "}
								<code>2, 1, 0</code> sends reminders two days before, one day
								before, and on the due date.
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
							<p className="text-muted-foreground text-sm">
								Only overdue bills in the same group stack together.
							</p>
						</div>
					)}

					{formData.overdueCadence === "weekly" ? (
						<div className="space-y-2">
							<Label htmlFor="overdueWeekday">Reminder weekday</Label>
							<Select
								value={formData.overdueWeekday}
								onValueChange={(value) => updateField("overdueWeekday", value)}
							>
								<SelectTrigger id="overdueWeekday">
									<SelectValue placeholder="Select weekday" />
								</SelectTrigger>
								<SelectContent>
									{reminderWeekdayOptions.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					) : null}
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={onSubmit} disabled={isSaving}>
						{isSaving ? "Saving..." : "Save reminder settings"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
