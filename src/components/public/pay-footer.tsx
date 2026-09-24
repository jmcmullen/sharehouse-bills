import { Button } from "@/components/ui/button";
import { PayNowDialog } from "./pay-now-dialog";

const LINK_BUTTON_CLASS = "h-11 w-full font-medium";

// The pay page's sticky actions. The statement link always shows, so a
// housemate with nothing to pay can still see their history.
export function PayFooterActions({
	statementPath,
	allBillsPath,
	nothingToPay,
	payVerb,
	payId,
	remainingAmount,
	overdueAmount,
}: {
	statementPath: string;
	allBillsPath: string | null;
	nothingToPay: boolean;
	payVerb: string;
	payId: string | null;
	remainingAmount: number;
	overdueAmount: number;
}) {
	const canPayOverdueOnly =
		!nothingToPay &&
		overdueAmount > 0.009 &&
		remainingAmount - overdueAmount > 0.009;
	return (
		<div className="fixed inset-x-0 bottom-0 z-20 bg-background/95 px-5 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:static sm:z-auto sm:mt-auto sm:bg-transparent sm:px-0 sm:pt-0 sm:pb-0 sm:backdrop-blur-none">
			<div className="mx-auto flex w-full max-w-md flex-col gap-2.5">
				{allBillsPath ? (
					<Button asChild variant="outline" className={LINK_BUTTON_CLASS}>
						<a href={allBillsPath}>View all bills</a>
					</Button>
				) : null}
				<Button asChild variant="outline" className={LINK_BUTTON_CLASS}>
					<a href={statementPath}>View statement</a>
				</Button>
				{canPayOverdueOnly ? (
					<PayNowDialog
						triggerLabel="Pay overdue only"
						triggerVariant="outline"
						title="Pay overdue only"
						payId={payId}
						amount={overdueAmount}
						descriptionValue="Bills"
					/>
				) : null}
				{nothingToPay ? null : (
					<PayNowDialog
						triggerLabel={payVerb}
						title={payVerb}
						payId={payId}
						amount={remainingAmount}
						descriptionValue="Bills"
					/>
				)}
			</div>
		</div>
	);
}
