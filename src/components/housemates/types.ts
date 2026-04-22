export interface Housemate {
	id: number;
	name: string;
	email?: string | null;
	bankAlias?: string | null;
	creditBalance?: number;
	isActive: boolean;
	isOwner: boolean;
	createdAt: Date;
}

export interface HousemateStats {
	totalOwed: number;
	totalPaid: number;
	totalOutstanding: number;
}

export interface HousemateBalanceMetric {
	id: number;
	name: string;
	isActive: boolean;
	amount: number;
}

export interface HousemateDebt {
	debt: {
		id: number;
		amountOwed: number;
		amountPaid: number;
		isPaid: boolean;
		paidAt?: Date | null;
	};
	bill: {
		id: number;
		billerName: string;
		dueDate: Date;
	};
}

export interface HousemateFormData {
	name: string;
	email: string;
	bankAlias: string;
}
