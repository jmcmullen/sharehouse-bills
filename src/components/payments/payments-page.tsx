import { useLoaderData } from "@tanstack/react-router";
import { PaymentsSummaryCards } from "./payments-summary-cards";
import { PaymentsTable } from "./payments-table";

export function PaymentsPage() {
	const { payments, summary } = useLoaderData({ from: "/_app/payments" });

	return (
		<div className="space-y-6">
			<div>
				<h1 className="font-bold text-3xl">Payments</h1>
				<p className="text-muted-foreground">
					Track recent reimbursements from housemates and see what is still owed
					back to you.
				</p>
			</div>

			<PaymentsSummaryCards summary={summary} />
			<PaymentsTable payments={payments} />
		</div>
	);
}
