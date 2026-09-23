import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import { reviewFiltersSchema } from "../api/services/ledger/payment-review-data";
import { PaymentReviewPage } from "../components/ledger/payment-review-page";
import { getPaymentReview } from "../functions/ledger";

const reviewSearchSchema = reviewFiltersSchema.extend({
	recentOnly: z.boolean().default(true),
});
const reviewDefaults = reviewSearchSchema.parse({});

export const Route = createFileRoute("/_app/payment-review")({
	validateSearch: reviewSearchSchema,
	search: { middlewares: [stripSearchParams(reviewDefaults)] },
	loaderDeps: ({ search }) => search,
	loader: ({ deps }) => getPaymentReview({ data: deps }),
	component: PaymentReviewPage,
});
