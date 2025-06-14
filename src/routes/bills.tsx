import { BillsPage } from "@/components/bills";
import { getAllBills } from "@/functions/bills";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/bills")({
	beforeLoad: async ({ context }) => {
		// Redirect to login if not authenticated (session checked in root)
		if (!context.session?.user) {
			throw redirect({
				to: "/login",
			});
		}
	},
	loader: async () => {
		// Server-side data loading
		const billsData = await getAllBills();
		return { billsData };
	},
	component: BillsPage,
});
