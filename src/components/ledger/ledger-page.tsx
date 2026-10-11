import {
	useLoaderData,
	useNavigate,
	useRouter,
	useSearch,
} from "@tanstack/react-router";
import { useState } from "react";
import { getLedgerAccount } from "../../functions/ledger";
import { StatementMonthSection } from "../public/statement-rows";
import { Button } from "../ui/button";
import { AllocateReceipt } from "./allocate-receipt";
import { BillPayments, PaymentSummary } from "./bill-payments";
import { RecordCash } from "./record-cash";

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
	const [receiptId, setReceiptId] = useState<string | null>(null);
	const [recordingCash, setRecordingCash] = useState(false);
	const [showCorrections, setShowCorrections] = useState(false);
	const patches = patch.source === loaded ? patch.accounts : {};
	async function reload(id: string) {
		const account = await getLedgerAccount({ data: { housemateId: id } });
		setPatch({ source: loaded, accounts: { ...patches, [id]: account } });
	}
	const accounts = loaded.map((item) => patches[item.id] ?? item);
	const account =
		accounts.find((item) => item.id === housemateId) ?? accounts[0];
	const timeline = account
		? showCorrections
			? account.corrections
			: account.statement
		: null;
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
				<Button onClick={() => router.invalidate()}>Refresh accounts</Button>
			</header>
			<div className="flex flex-wrap justify-between gap-3">
				<select
					aria-label="Housemate statement"
					value={account?.id ?? ""}
					onChange={(e) => {
						setReceiptId(null);
						setRecordingCash(false);
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
				{account && (
					<Button variant="outline" onClick={() => setRecordingCash(true)}>
						Record cash
					</Button>
				)}
			</div>
			{account && timeline ? (
				<>
					<PaymentSummary
						balanceCents={account.balanceCents}
						{...account.billing}
					/>
					<BillPayments
						key={account.id}
						billing={account.billing}
						onAllocate={setReceiptId}
					/>
					<details className="rounded-lg border p-4">
						<summary className="cursor-pointer text-sm">
							Statement and running balance
						</summary>
						<p className="mt-2 text-muted-foreground text-sm">
							Bill shares and money received on one timeline, newest first. The
							balance after each item is everything charged less everything
							received.
						</p>
						<label className="mt-3 flex items-center gap-2 text-muted-foreground text-sm">
							<input
								type="checkbox"
								checked={showCorrections}
								onChange={(event) => setShowCorrections(event.target.checked)}
							/>
							Include voided payments and corrections
						</label>
						<div className="mt-4 space-y-6">
							{[...timeline.recent, ...timeline.earlier].map((month) => (
								<StatementMonthSection key={month.key} month={month} />
							))}
						</div>
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
					{recordingCash && (
						<RecordCash
							key={account.id}
							housemateId={account.id}
							housemateName={account.name}
							billing={account.billing}
							onClose={() => setRecordingCash(false)}
							onSaved={async () => {
								await reload(account.id);
								await router.invalidate();
							}}
						/>
					)}
				</>
			) : (
				<p>Add a housemate to start recording charges and payments.</p>
			)}
		</div>
	);
}
