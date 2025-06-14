import { HousematesPage } from "@/components/housemates/housemates-page";
import { getAllHousemates } from "@/functions/housemates";
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
		const housematesData = await getAllHousemates();
		return { housematesData };
	},
	component: HousematesPage,
});
