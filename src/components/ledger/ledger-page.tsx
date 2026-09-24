import {
	Link,
	useLoaderData,
	useNavigate,
	useRouter,
	useSearch,
} from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { getLedgerAccount, syncLedger } from "../../functions/ledger";
import { Button } from "../ui/button";
import { AllocateReceipt, RecordReceipt } from "./allocate-receipt";
import { BillPayments, PaymentSummary } from "./bill-payments";
import { StatementHistory } from "./statement";

type Account = Awaited<ReturnType<typeof getLedgerAccount>>;

export function LedgerPage() {
	const loaded = useLoaderData({ from: "/_app/ledger" });
	const { housemateId } = useSearch({ from: "/_app/ledger" });
	const navigate = useNavigate({ from: "/ledger" });
	const router = useRouter();
	const [patch, setPatch] = useState<{
		source: typeof loaded;
		accounts: Record<string, Account>;
	}>({ source: loaded, accounts: {} });
	const [busy, setBusy] = useState(false);
	const [receiptId, setReceiptId] = useState<string | null>(null);
	const [recording, setRecording] = useState(false);
	const [showCorrections, setShowCorrections] = useState(false);
	const patches = patch.source === loaded ? patch.accounts : {};
	async function reload(id: string) {
		const account = await getLedgerAccount({ data: { housemateId: id } });
		setPatch({ source: loaded, accounts: { ...patches, [id]: account } });
	}
	async function sync() {
		setBusy(true);
		try {
			await syncLedger();
			await router.invalidate();
			toast.success("Statement is up to date");
		} catch {
			toast.error("Could not refresh the statement");
		} finally {
			setBusy(false);
		}
	}
	if (!loaded.available)
		return <p>The ledger migration is not installed yet.</p>;
	const accounts = loaded.accounts.map((item) => patches[item.id] ?? item);
	const account =
		accounts.find((item) => item.id === housemateId) ?? accounts[0];
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
					Review payments
				</Link>
			</div>
			<div className="flex flex-wrap justify-between gap-3">
				<select
					aria-label="Housemate statement"
					value={account?.id ?? ""}
					onChange={(e) => {
						setReceiptId(null);
						setRecording(false);
						void navigate({ search: { housemateId: e.target.value } });
					}}
					className="h-10 rounded-md border bg-background px-3"
				>
					{accounts.map((item) => (
						<option key={item.id} value={item.id}>
							{item.name}
						</option>
					))}
				</select>
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
							onSaved={() => reload(account.id)}
						/>
					)}
					{recording && (
						<RecordReceipt
							key={account.id}
							housemateId={account.id}
							name={account.name}
							revision={account.billing.revision}
							onClose={() => setRecording(false)}
							onSaved={() => reload(account.id)}
						/>
					)}
				</>
			) : (
				<p>Add a housemate to start recording charges and payments.</p>
			)}
		</div>
	);
}
