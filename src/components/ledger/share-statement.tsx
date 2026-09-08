import { useState } from "react";
import { toast } from "sonner";
import {
	issueStatementLink,
	revokeStatementLink,
} from "../../functions/ledger-statement";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { ledgerDate } from "./statement";

export function ShareStatement({
	housemateId,
	name,
	expiresAt,
	onChanged,
}: {
	housemateId: string;
	name: string;
	expiresAt: number | null;
	onChanged: () => Promise<void>;
}) {
	const [link, setLink] = useState("");
	const [expiry, setExpiry] = useState(expiresAt);
	const [busy, setBusy] = useState(false);
	async function issue() {
		setBusy(true);
		try {
			const result = await issueStatementLink({ data: { housemateId } });
			setLink(new URL(result.path, window.location.origin).href);
			setExpiry(result.expiresAt);
			await onChanged();
		} catch {
			toast.error("Could not create statement link");
		} finally {
			setBusy(false);
		}
	}
	async function revoke() {
		setBusy(true);
		try {
			await revokeStatementLink({ data: { housemateId } });
			setLink("");
			setExpiry(null);
			await onChanged();
			toast.success("Statement link revoked");
		} catch {
			toast.error("Could not revoke statement link");
		} finally {
			setBusy(false);
		}
	}
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="outline">Share private statement</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{name}'s private statement</DialogTitle>
					<DialogDescription>
						Anyone with this link can view this housemate's history and balance.
						It gives no editing access. Links expire after 90 days.
					</DialogDescription>
				</DialogHeader>
				{expiry && (
					<p className="text-sm">Current link expires {ledgerDate(expiry)}.</p>
				)}
				{link && (
					<div className="space-y-2">
						<Input
							readOnly
							aria-label="Private statement link"
							value={link}
							onFocus={(e) => e.target.select()}
						/>
						<Button
							onClick={() =>
								navigator.clipboard.writeText(link).then(
									() => toast.success("Private link copied"),
									() => toast.error("Copy the link from the field above"),
								)
							}
						>
							Copy link
						</Button>
						<a
							href={link}
							target="_blank"
							rel="noreferrer"
							className="ml-4 text-sm underline underline-offset-4"
						>
							Preview statement
						</a>
					</div>
				)}
				<p className="text-muted-foreground text-sm">
					Creating a new link disables the previous one. Copy it and share it
					privately with {name.split(" ")[0]}.
				</p>
				<div className="flex flex-wrap gap-2">
					<Button disabled={busy} onClick={issue}>
						{busy
							? "Updating…"
							: expiry
								? "Replace with a new link"
								: "Create private link"}
					</Button>
					{expiry && (
						<Button variant="outline" disabled={busy} onClick={revoke}>
							Revoke access
						</Button>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
