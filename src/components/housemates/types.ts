export interface Housemate {
	id: number;
	name: string;
	email?: string | null;
	bankAlias?: string | null;
	isActive: boolean;
	isOwner: boolean;
	createdAt: Date;
}

export interface HousemateStats {
	totalOwed: number;
	totalPaid: number;
	totalOutstanding: number;
}

export interface HousemateDebt {
	debt: {
		id: number;
		amountOwed: number;
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
