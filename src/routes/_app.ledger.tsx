import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { LedgerPage } from "../components/ledger/ledger-page";
import { getLedgerAccounts } from "../functions/ledger";

export const Route = createFileRoute("/_app/ledger")({
	validateSearch: z.object({ housemateId: z.string().optional() }),
	loader: () => getLedgerAccounts(),
	component: LedgerPage,
});
