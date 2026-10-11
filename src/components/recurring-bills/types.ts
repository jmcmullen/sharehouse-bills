interface RecurringBillListAssignment {
	id: string;
	recurringBillId: string;
	housemateId: string;
	customCents: number | null;
	isActive: boolean;
	housemateName: string;
	housemateIsOwner: boolean;
	housemateIsActive: boolean;
}

interface RecurringBillTemplate {
	id: string;
	templateName: string;
	billerName: string;
	totalCents: number;
	frequency: "weekly" | "fortnightly" | "monthly" | "yearly";
	dayOfWeek: number | null;
	dayOfMonth: number | null;
	startDate: string | Date;
	endDate: string | Date | null;
	isActive: boolean;
	splitStrategy: "equal" | "custom";
	stackGroup: string | null;
	lastGeneratedDate: string | Date | null;
	createdAt: string | Date;
	updatedAt: string | Date;
}

interface RecurringBillPreviewAssignment {
	housemateId: string;
	name: string;
	isOwner: boolean;
	customCents: number | null;
	amountCents: number;
}

interface RecurringBillPreview {
	nextDueDate: string | Date | null;
	assignments: RecurringBillPreviewAssignment[];
	ownerShareCents: number;
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

interface RecurringBillAssignmentFormData {
	housemateId: string;
	name: string;
	isOwner: boolean;
	isActive: boolean;
	// Dollars as typed.
	customDollars: string;
}

export interface RecurringBillFormData {
	id: string | null;
	templateName: string;
	billerName: string;
	// Dollars as typed.
	totalDollars: string;
	frequency: "weekly" | "fortnightly" | "monthly" | "yearly";
	dayOfWeek: string;
	dayOfMonth: string;
	startDate: string;
	endDate: string;
	isActive: boolean;
	splitStrategy: "equal" | "custom";
	stackGroup: string;
	assignments: RecurringBillAssignmentFormData[];
}

export interface RecurringBillPreviewSummary {
	includedCount: number;
	perPersonCents: number | null;
	ownerShareCents: number;
	nonOwnerCents: number;
	assignments: Array<{
		housemateId: string;
		name: string;
		isOwner: boolean;
		isActive: boolean;
		amountCents: number;
		customCents: number | null;
	}>;
}
