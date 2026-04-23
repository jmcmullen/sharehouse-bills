export interface Housemate {
	id: string;
	name: string;
	email?: string | null;
	whatsappNumber?: string | null;
	bankAlias?: string | null;
	creditBalance?: number;
	payPath?: string | null;
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
	id: string;
	name: string;
	isActive: boolean;
	amount: number;
}

export interface HousemateDebt {
	debt: {
		id: string;
		amountOwed: number;
		amountPaid: number;
		isPaid: boolean;
		paidAt?: Date | null;
	};
	bill: {
		id: string;
		billerName: string;
		dueDate: Date;
	};
}

export interface HousemateFormData {
	name: string;
	email: string;
	whatsappNumber: string;
	bankAlias: string;
}
