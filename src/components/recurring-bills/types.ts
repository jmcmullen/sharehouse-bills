export interface RecurringBillListAssignment {
	id: number;
	recurringBillId: number;
	housemateId: number;
	customAmount: number | null;
	isActive: boolean;
	housemateName: string;
	housemateIsOwner: boolean;
	housemateIsActive: boolean;
}

export interface RecurringBillTemplate {
	id: number;
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
	lastGeneratedDate: string | Date | null;
	createdAt: string | Date;
	updatedAt: string | Date;
}

export interface RecurringBillPreviewAssignment {
	housemateId: number;
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
	id: number;
	name: string;
	email: string | null;
	bankAlias: string | null;
	isActive: boolean;
	isOwner: boolean;
}

export interface RecurringBillAssignmentFormData {
	housemateId: number;
	name: string;
	isOwner: boolean;
	isActive: boolean;
	customAmount: string;
}

export interface RecurringBillFormData {
	id: number | null;
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
	assignments: RecurringBillAssignmentFormData[];
}

export interface RecurringBillPreviewSummary {
	includedCount: number;
	amountPerPerson: number | null;
	ownerShare: number;
	nonOwnerTotal: number;
	assignments: Array<{
		housemateId: number;
		name: string;
		isOwner: boolean;
		isActive: boolean;
		amountOwed: number;
		customAmount: number | null;
	}>;
}
