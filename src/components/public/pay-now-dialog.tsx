import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type PayNowDialogProps = {
	triggerLabel: string;
	title: string;
	payId: string | null;
	amount: number;
	descriptionValue: string;
};

function formatCurrency(amount: number) {
	return new Intl.NumberFormat("en-AU", {
		style: "currency",
		currency: "AUD",
	}).format(amount);
}

function sanitizeCopyValue(value: string) {
	return value.replace(/\$/g, "").replace(/,/g, "").replace(/\s+/g, "").trim();
}

async function writeToClipboard(value: string) {
	if (navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(value);
			return true;
		} catch {}
	}
	try {
		const textarea = document.createElement("textarea");
		textarea.value = value;
		textarea.setAttribute("readonly", "");
		textarea.style.position = "fixed";
		textarea.style.top = "0";
		textarea.style.left = "0";
		textarea.style.opacity = "0";
		document.body.appendChild(textarea);
		textarea.focus();
		textarea.select();
		const ok = document.execCommand("copy");
		document.body.removeChild(textarea);
		return ok;
	} catch {
		return false;
	}
}

export function PayNowDialog(input: PayNowDialogProps) {
	const [copiedStep, setCopiedStep] = useState<string | null>(null);

	async function handleCopy(stepId: string, rawValue: string) {
		const value = sanitizeCopyValue(rawValue);
		if (!value) return;

		const ok = await writeToClipboard(value);
		if (!ok) {
			toast.error("Couldn't copy. Try long-pressing the text instead.");
			return;
		}

		setCopiedStep(stepId);
		toast.success("Copied", {
			description: "Ready to paste into your banking app.",
		});
		setTimeout(
			() => setCopiedStep((current) => (current === stepId ? null : current)),
			2000,
		);
	}

	const steps = [
		...(input.payId
			? [
					{
						id: "payid",
						label: "1. Copy this PayID",
						displayValue: input.payId,
						copyValue: input.payId,
					},
				]
			: []),
		{
			id: "amount",
			label: `${input.payId ? "2" : "1"}. Copy this amount`,
			displayValue: formatCurrency(input.amount),
			copyValue: input.amount.toFixed(2),
		},
		{
			id: "description",
			label: `${input.payId ? "3" : "2"}. Paste this as the description`,
			displayValue: input.descriptionValue,
			copyValue: input.descriptionValue,
			helperText: "Paste exactly, or it won't match.",
		},
	] as const;

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button className="h-11 w-full font-medium">
					{input.triggerLabel}
				</Button>
			</DialogTrigger>
			<DialogContent
				showCloseButton={false}
				className="!inset-0 !top-0 !left-0 !h-dvh !max-h-none !w-screen !max-w-none !translate-x-0 !translate-y-0 overflow-y-auto rounded-none border-0 p-0"
				onOpenAutoFocus={(event) => event.preventDefault()}
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					if (document.activeElement instanceof HTMLElement) {
						document.activeElement.blur();
					}
				}}
			>
				<div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-5 pt-8 pb-24">
					<DialogHeader className="text-left">
						<DialogTitle className="text-2xl tracking-tight">
							{input.title}
						</DialogTitle>
						<DialogDescription>
							Send the funds via Osko/PayID.
						</DialogDescription>
					</DialogHeader>

					<div className="flex flex-col gap-5">
						{steps.map((step) => (
							<section key={step.id} className="flex flex-col gap-2">
								<p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.12em]">
									{step.label}
								</p>
								<button
									type="button"
									onClick={() => handleCopy(step.id, step.copyValue)}
									className="group flex min-h-14 w-full items-center justify-between gap-3 rounded-md border bg-foreground/[0.04] px-4 py-3 text-foreground shadow-xs transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-safe:active:scale-[0.99] motion-safe:hover:bg-foreground/[0.06] dark:bg-foreground/[0.06] dark:motion-safe:hover:bg-foreground/[0.08]"
								>
									<span className="min-w-0 flex-1 break-all text-left font-semibold text-base tracking-tight">
										{step.displayValue}
									</span>
									<span className="flex shrink-0 items-center gap-1.5 font-medium text-muted-foreground text-sm">
										{copiedStep === step.id ? (
											<>
												<Check className="h-4 w-4" strokeWidth={2.5} />
												Copied
											</>
										) : (
											<>
												<Copy className="h-4 w-4" strokeWidth={2.25} />
												Copy
											</>
										)}
									</span>
								</button>
								{"helperText" in step && step.helperText ? (
									<p className="text-[12.5px] text-muted-foreground leading-5">
										{step.helperText}
									</p>
								) : null}
							</section>
						))}
					</div>

					<DialogClose asChild>
						<Button
							variant="outline"
							className="mt-auto h-11 w-full font-medium"
						>
							Close
						</Button>
					</DialogClose>
				</div>
			</DialogContent>
		</Dialog>
	);
}
