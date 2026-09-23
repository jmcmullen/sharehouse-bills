import { Link, useLoaderData } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { getLedger, syncLedger } from "../../functions/ledger";
import { Button } from "../ui/button";
import { AllocateReceipt, RecordReceipt } from "./allocate-receipt";
import { BillPayments, PaymentSummary } from "./bill-payments";
import { ShareStatement } from "./share-statement";
import { StatementHistory } from "./statement";

export function LedgerPage() {
	const initial = useLoaderData({ from: "/_app/ledger" });
	const [data, setData] = useState(initial);
	const [housemateId, setHousemateId] = useState("");
	const [busy, setBusy] = useState(false);
	const [receiptId, setReceiptId] = useState<string | null>(null);
	const [recording, setRecording] = useState(false);
	const [showCorrections, setShowCorrections] = useState(false);
	async function refresh() {
		setData(await getLedger({ data: { reviewPage: 0 } }));
	}
	async function sync() {
		setBusy(true);
		try {
			await syncLedger();
			await refresh();
			toast.success("Statement is up to date");
		} catch {
			toast.error("Could not refresh the statement");
		} finally {
			setBusy(false);
		}
	}
	if (!data.available) return <p>The ledger migration is not installed yet.</p>;
	const account =
		data.accounts.find((item) => item.id === housemateId) ?? data.accounts[0];
	return (
		<div className="mx-auto max-w-5xl space-y-6">
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="font-semibold text-3xl tracking-tight">
						Housemate accounts
					</h1>
					<p className="mt-2 text-muted-foreground">
						See which bills are paid and the money that covered them.
					</p>
				</div>
				<Button onClick={sync} disabled={busy}>
					{busy ? "Refreshing…" : "Refresh accounts"}
				</Button>
			</header>
			<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
				<p>
					Payment history is under review. Existing reminders still use the
					previous balances.
				</p>
				<Link
					to="/payment-review"
					className="font-medium underline underline-offset-4"
				>
					Review payments ({data.totalReviewCount})
				</Link>
			</div>
			{data.pendingEvents > 0 && (
				<output className="block rounded-lg border p-4 text-sm">
					{data.pendingEvents} changes are waiting to be synced. Refresh
					accounts to update the balances.
				</output>
			)}
			<div className="flex flex-wrap justify-between gap-3">
				<select
					aria-label="Housemate statement"
					value={account?.id ?? ""}
					onChange={(e) => {
						setHousemateId(e.target.value);
						setReceiptId(null);
						setRecording(false);
					}}
					className="h-10 rounded-md border bg-background px-3"
				>
					{data.accounts.map((item) => (
						<option key={item.id} value={item.id}>
							{item.name}
						</option>
					))}
				</select>
				{account && (
					<ShareStatement
						key={account.id}
						housemateId={account.id}
						name={account.name}
						expiresAt={account.linkExpiresAt}
						onChanged={refresh}
					/>
				)}
			</div>
			{account ? (
				<>
					<PaymentSummary
						balanceCents={account.balanceCents}
						{...account.billing}
					/>
					<div className="flex justify-end">
						<Button onClick={() => setRecording(true)}>
							Record money received
						</Button>
					</div>
					<BillPayments
						key={account.id}
						billing={account.billing}
						onAllocate={setReceiptId}
					/>
					<details className="rounded-lg border p-4">
						<summary className="cursor-pointer text-sm">
							Journal and running balance
						</summary>
						<p className="text-muted-foreground text-sm">
							The journal retains the original records and corrections. Linked
							manual entries appear as one receipt in Money received.
						</p>
						<StatementHistory
							key={account.id}
							entries={(showCorrections
								? account.auditEntries
								: account.entries
							).map((entry) => ({
								...entry,
								isReversal: entry.reversesEntryId !== null,
							}))}
						/>
						<label className="flex items-center gap-2 text-muted-foreground text-sm">
							<input
								type="checkbox"
								checked={showCorrections}
								onChange={(event) => setShowCorrections(event.target.checked)}
							/>
							Include reversed entries and corrections
						</label>
					</details>
					{receiptId && (
						<AllocateReceipt
							key={`${account.id}:${receiptId}`}
							housemateId={account.id}
							receiptId={receiptId}
							billing={account.billing}
							onClose={() => setReceiptId(null)}
							onSaved={refresh}
						/>
					)}
					{recording && (
						<RecordReceipt
							key={account.id}
							housemateId={account.id}
							name={account.name}
							revision={account.billing.revision}
							onClose={() => setRecording(false)}
							onSaved={refresh}
						/>
					)}
				</>
			) : (
				<p>Add a housemate to start recording charges and payments.</p>
			)}
		</div>
	);
}
