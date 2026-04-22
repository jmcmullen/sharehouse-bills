import type {
	BillReminderMode,
	BillReminderOverdueCadence,
} from "@/lib/bill-reminder-config";

export interface RecurringBillListAssignment {
	id: string;
	recurringBillId: string;
	housemateId: string;
	customAmount: number | null;
	isActive: boolean;
	housemateName: string;
	housemateIsOwner: boolean;
	housemateIsActive: boolean;
}

export interface RecurringBillTemplate {
	id: string;
	templateName: string;
	billerName: string;
	totalAmount: number;
	frequency: "weekly" | "monthly" | "yearly";
	dayOfWeek: number | null;
	dayOfMonth: number | null;
	startDate: string | Date;
	endDate: string | Date | null;
	isActive: boolean;
	splitStrategy: "equal" | "custom";
	remindersEnabled: boolean;
	reminderMode: BillReminderMode;
	stackGroup: string | null;
	preDueOffsetsDays: number[];
	overdueCadence: BillReminderOverdueCadence;
	overdueWeekday: number | null;
	lastGeneratedDate: string | Date | null;
	createdAt: string | Date;
	updatedAt: string | Date;
}

export interface RecurringBillPreviewAssignment {
	housemateId: string;
	name: string;
	isOwner: boolean;
	customAmount: number | null;
	amountOwed: number;
}

export interface RecurringBillPreview {
	nextDueDate: string | Date | null;
	assignments: RecurringBillPreviewAssignment[];
	ownerShare: number;
}

export interface RecurringBillListItem {
	template: RecurringBillTemplate;
	assignments: RecurringBillListAssignment[];
	nextDueDate: string | Date | null;
	preview: RecurringBillPreview;
	generatedCount: number;
}

export interface HousemateOption {
	id: string;
	name: string;
	email: string | null;
	bankAlias: string | null;
	isActive: boolean;
	isOwner: boolean;
}

export interface RecurringBillAssignmentFormData {
	housemateId: string;
	name: string;
	isOwner: boolean;
	isActive: boolean;
	customAmount: string;
}

export interface RecurringBillFormData {
	id: string | null;
	templateName: string;
	billerName: string;
	totalAmount: string;
	frequency: "weekly" | "monthly" | "yearly";
	dayOfWeek: string;
	dayOfMonth: string;
	startDate: string;
	endDate: string;
	isActive: boolean;
	splitStrategy: "equal" | "custom";
	remindersEnabled: boolean;
	reminderMode: BillReminderMode;
	stackGroup: string;
	preDueOffsetsInput: string;
	overdueCadence: BillReminderOverdueCadence;
	overdueWeekday: string;
	assignments: RecurringBillAssignmentFormData[];
}

export interface RecurringBillPreviewSummary {
	includedCount: number;
	amountPerPerson: number | null;
	ownerShare: number;
	nonOwnerTotal: number;
	assignments: Array<{
		housemateId: string;
		name: string;
		isOwner: boolean;
		isActive: boolean;
		amountOwed: number;
		customAmount: number | null;
	}>;
}
