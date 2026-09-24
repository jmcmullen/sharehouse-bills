export interface BillData {
	bill: {
		id: string;
		totalAmount: number;
		billerName: string;
		publicPath?: string | null;
		dueDate: string | Date;
		status: string;
		pdfSha256?: string | null;
		pdfUrl?: string | null;
		sourceFilename?: string | null;
	};
	debt?: {
		id: string;
		amountOwed: number;
		amountPaid: number;
		isPaid: boolean;
	} | null;
	housemate?: {
		name: string;
		payPath?: string | null;
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

export interface CashReceiptData {
	debtId: string;
	amountCents: number;
	receivedAt: number;
	note: string;
}

export interface UploadResult {
	success: boolean;
	message: string;
	billId?: string;
	error?: string;
}
