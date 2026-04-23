import { PaymentsPage } from "@/components/payments";
import { getRecentPayments } from "@/functions/payments";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/payments")({
	loader: async () => {
		return await getRecentPayments();
	},
	component: PaymentsPage,
});
