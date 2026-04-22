import { RecurringBillsPage } from "@/components/recurring-bills";
import { getActiveHousemates } from "@/functions/housemates";
import { getRecurringBills } from "@/functions/recurring-bills";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/recurring-bills")({
	beforeLoad: async ({ context }) => {
		if (!context.session?.user) {
			throw redirect({
				to: "/login",
			});
		}
	},
	loader: async () => {
		const [recurringBillsData, activeHousemates] = await Promise.all([
			getRecurringBills(),
			getActiveHousemates(),
		]);

		return { recurringBillsData, activeHousemates };
	},
	component: RecurringBillsPage,
});
