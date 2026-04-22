import { HousematesPage } from "@/components/housemates/housemates-page";
import {
	getAllHousemates,
	getHousemateOutstandingBalances,
	getHousemateOverdueBalances,
} from "@/functions/housemates";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/housemates")({
	loader: async () => {
		const [housematesData, outstandingBalances, overdueBalances] =
			await Promise.all([
				getAllHousemates(),
				getHousemateOutstandingBalances(),
				getHousemateOverdueBalances(),
			]);
		return { housematesData, outstandingBalances, overdueBalances };
	},
	component: HousematesPage,
});
