export interface Housemate {
	id: string;
	name: string;
	email?: string | null;
	whatsappNumber?: string | null;
	bankAlias?: string | null;
	payPath?: string | null;
	isActive: boolean;
	isOwner: boolean;
	createdAt: Date;
}

interface HousemateBalanceRow {
	id: string;
	name: string;
	isActive: boolean;
	amountCents: number;
}

export interface HousemateBalanceMetric {
	rows: HousemateBalanceRow[];
	totalCents: number;
	count: number;
}

export interface HousemateAccount {
	remainingCents: number;
	owesCents: number;
	creditCents: number;
	shares: Array<{
		id: string;
		name: string;
		dueAt: number;
		amountCents: number;
		paidCents: number;
		remainingCents: number;
		settledAt: number | null;
	}>;
}

export interface HousemateFormData {
	name: string;
	email: string;
	whatsappNumber: string;
	bankAlias: string;
}
