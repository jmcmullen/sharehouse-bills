import {
	createHousemate,
	deactivateHousemate,
	reactivateHousemate,
	updateHousemate,
} from "@/functions/housemates";

export async function createHousemateAction(data: {
	name: string;
	email?: string;
	bankAlias?: string;
}) {
	const sanitizedData = {
		name: data.name.trim(),
		email: data.email?.trim() || undefined,
		bankAlias: data.bankAlias?.trim() || undefined,
	};

	return await createHousemate({ data: sanitizedData });
}

export async function updateHousemateAction(data: {
	id: number;
	name: string;
	email?: string;
	bankAlias?: string;
}) {
	const sanitizedData = {
		id: data.id,
		name: data.name.trim(),
		email: data.email?.trim() || undefined,
		bankAlias: data.bankAlias?.trim() || undefined,
	};

	return await updateHousemate({ data: sanitizedData });
}

export async function deactivateHousemateAction(id: number) {
	return await deactivateHousemate({ data: { id } });
}

export async function reactivateHousemateAction(id: number) {
	return await reactivateHousemate({ data: { id } });
}
