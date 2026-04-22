import { HousematesPage } from "@/components/housemates/housemates-page";
import {
	getAllHousemates,
	getHousemateOutstandingBalances,
	getHousemateOverdueBalances,
} from "@/functions/housemates";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/housemates")({
	beforeLoad: async ({ context }) => {
		if (!context.session?.user) {
			throw redirect({
				to: "/login",
			});
		}
	},
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
