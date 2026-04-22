import { BillsPage } from "@/components/bills";
import { getAllBills } from "@/functions/bills";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/bills")({
	loader: async () => {
		// Server-side data loading
		const billsData = await getAllBills();
		return { billsData };
	},
	component: BillsPage,
});
