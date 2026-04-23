export interface PaymentListItem {
	id: string;
	transactionId: string;
	housemateId: string;
	housemateName: string;
	description: string;
	amount: number;
	source: "up_bank" | "manual_reconciliation" | "manual_admin";
	matchType:
		| "exact_match"
		| "combination_match"
		| "partial_allocation"
		| "credit_created"
		| "manual_match"
		| "no_match"
		| "ambiguous_match"
		| "insufficient_data"
		| "ignored";
	creditAmount: number;
	paidAt: string | Date;
	appliedBillNames: string[];
}

export interface PaymentsSummary {
	recentAmount: number;
	recentCount: number;
	outstandingAmount: number;
	creditBalance: number;
}
