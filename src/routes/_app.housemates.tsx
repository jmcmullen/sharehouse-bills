import { HousematesPage } from "@/components/housemates/housemates-page";
import { getAllHousemates, getHousemateBalances } from "@/functions/housemates";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/housemates")({
	loader: async () => {
		const [housematesData, balances] = await Promise.all([
			getAllHousemates(),
			getHousemateBalances(),
		]);
		return { housematesData, balances };
	},
	component: HousematesPage,
});
