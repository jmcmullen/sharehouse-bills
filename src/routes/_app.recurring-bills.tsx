import { RecurringBillsPage } from "@/components/recurring-bills";
import { getActiveHousemates } from "@/functions/housemates";
import { getRecurringBills } from "@/functions/recurring-bills";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/recurring-bills")({
	loader: async () => {
		const [recurringBillsData, activeHousemates] = await Promise.all([
			getRecurringBills(),
			getActiveHousemates(),
		]);

		return { recurringBillsData, activeHousemates };
	},
	component: RecurringBillsPage,
});
