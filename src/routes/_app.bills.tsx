import { BillsPage } from "@/components/bills";
import { getBillVerification } from "@/functions/bill-verification";
import { getAllBills } from "@/functions/bills";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/bills")({
	loader: async () => {
		const [billsData, verification] = await Promise.all([
			getAllBills(),
			getBillVerification(),
		]);
		return { billsData, verification };
	},
	component: BillsPage,
});
