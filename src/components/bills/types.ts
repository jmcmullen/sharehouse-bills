export interface BillData {
	bill: {
		id: number;
		totalAmount: number;
		billerName: string;
		dueDate: string | Date;
		status: string;
	};
	debt?: {
		id: number;
		amountOwed: number;
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
	debtId: number;
	amountPaid: number;
}

export interface UploadResult {
	success: boolean;
	message: string;
	billId?: number;
	error?: string;
}
