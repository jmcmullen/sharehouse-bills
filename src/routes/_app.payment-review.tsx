import { createFileRoute } from "@tanstack/react-router";
import { PaymentReviewPage } from "../components/ledger/payment-review-page";
import { getLedger } from "../functions/ledger";
export const Route = createFileRoute("/_app/payment-review")({
	loader: () =>
		getLedger({ data: { reviewPage: 0, scope: "all", recentOnly: true } }),
	component: PaymentReviewPage,
});
