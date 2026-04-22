import type {
	BillReminderMode,
	BillReminderOverdueCadence,
} from "@/lib/bill-reminder-config";

export interface BillData {
	bill: {
		id: string;
		totalAmount: number;
		billerName: string;
		dueDate: string | Date;
		status: string;
		pdfSha256?: string | null;
		pdfUrl?: string | null;
		sourceFilename?: string | null;
		remindersEnabled: boolean;
		reminderMode: BillReminderMode;
		stackGroup: string | null;
		preDueOffsetsDays: number[];
		overdueCadence: BillReminderOverdueCadence;
		overdueWeekday: number | null;
	};
	debt?: {
		id: string;
		amountOwed: number;
		amountPaid: number;
		isPaid: boolean;
	} | null;
	housemate?: {
		name: string;
	} | null;
}

export interface BillSummary {
	totalBills: number;
	totalAmount: number;
	totalUnpaid: number;
	unpaidCount: number;
	paidAmount: number;
	outstandingAmount: number;
}

export interface GroupedBill {
	bill: BillData["bill"];
	debts: Array<{
		debt: NonNullable<BillData["debt"]>;
		housemate: NonNullable<BillData["housemate"]>;
	}>;
}

export interface DebtSummary {
	paid: number;
	total: number;
	paidAmount: number;
	owedAmount: number;
	debts: Array<{
		debt: NonNullable<BillData["debt"]>;
		housemate: NonNullable<BillData["housemate"]>;
	}>;
}

export interface PaymentData {
	debtId: string;
	amountPaid: number;
}

export interface UploadResult {
	success: boolean;
	message: string;
	billId?: string;
	error?: string;
}

export interface BillReminderFormData {
	remindersEnabled: boolean;
	reminderMode: BillReminderMode;
	stackGroup: string;
	preDueOffsetsInput: string;
	overdueCadence: BillReminderOverdueCadence;
	overdueWeekday: string;
}
