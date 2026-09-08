import { createFileRoute } from "@tanstack/react-router";
import { LedgerPage } from "../components/ledger/ledger-page";
import { getLedger } from "../functions/ledger";

export const Route = createFileRoute("/_app/ledger")({
	loader: () => getLedger({ data: { reviewPage: 0 } }),
	component: LedgerPage,
});
