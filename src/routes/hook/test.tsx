import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/hook/test")({
	component: TestWebhook,
});

interface ProcessingResult {
	success: boolean;
	message: string;
	results?: Array<{
		filename: string;
		success: boolean;
		billId?: number;
		error?: string;
		parsedData?: {
			billerName: string;
			totalAmount: number;
			dueDate: string;
			billType?: string;
			accountNumber?: string;
			referenceNumber?: string;
		};
	}>;
}

function TestWebhook() {
	const [isProcessing, setIsProcessing] = useState(false);
	const [result, setResult] = useState<ProcessingResult | null>(null);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setIsProcessing(true);
		setResult(null);
		setError(null);

		const formData = new FormData(e.currentTarget);

		try {
			const response = await fetch("/api/email-webhook", {
				method: "POST",
				body: formData,
			});

			const data = await response.json();

			if (response.ok) {
				setResult(data);
			} else {
				setError(data.error || "Processing failed");
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Network error");
		} finally {
			setIsProcessing(false);
		}
	};

	return (
		<div className="min-h-screen bg-background">
			<div className="container mx-auto max-w-2xl px-4 py-8">
				<h1 className="mb-8 font-bold text-3xl">Test PDF Bill Processing</h1>

				<Card className="mb-6 p-4">
					<h2 className="mb-2 font-semibold text-lg">📋 Instructions</h2>
					<ul className="space-y-1 text-muted-foreground text-sm">
						<li>• Upload a PDF bill (electricity, gas, internet, etc.)</li>
						<li>• The AI will extract: biller name, amount, due date</li>
						<li>• A bill will be created and split among active housemates</li>
						<li>• Make sure you have active housemates in the system first!</li>
					</ul>
				</Card>

				<Card className="p-6">
					<form onSubmit={handleSubmit} className="space-y-4">
						<div>
							<Label htmlFor="from">From Email</Label>
							<Input
								id="from"
								type="email"
								name="from"
								defaultValue="test@example.com"
								required
							/>
						</div>

						<div>
							<Label htmlFor="subject">Email Subject</Label>
							<Input
								id="subject"
								type="text"
								name="subject"
								defaultValue="Test Bill - December 2024"
								required
							/>
						</div>

						<input type="hidden" name="attachments" value="1" />

						<div>
							<Label htmlFor="attachment1">PDF Bill File</Label>
							<Input
								id="attachment1"
								type="file"
								name="attachment1"
								accept=".pdf"
								required
							/>
						</div>

						<Button type="submit" disabled={isProcessing} className="w-full">
							{isProcessing ? (
								<>
									<span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-white border-b-2" />
									Processing PDF...
								</>
							) : (
								"🤖 Process PDF Bill"
							)}
						</Button>
					</form>
				</Card>

				{/* Results Display */}
				{error && (
					<Card className="mt-6 border-destructive p-4">
						<h3 className="mb-2 font-semibold text-destructive text-lg">
							❌ Error
						</h3>
						<p className="text-destructive">{error}</p>
					</Card>
				)}

				{result && (
					<Card className="mt-6 p-4">
						<h3 className="mb-4 font-semibold text-lg">
							✅ Processing Complete
						</h3>

						<div className="space-y-4">
							<div>
								<p className="text-foreground">
									<strong>Status:</strong> {result.message}
								</p>
							</div>

							{result.results?.map((item, index) => (
								<div
									key={`${item.filename}-${index}`}
									className="border-border border-t pt-4"
								>
									<h4 className="mb-2 font-medium">📄 {item.filename}</h4>

									{item.success ? (
										<div className="space-y-2 text-sm">
											{item.billId && (
												<p className="text-foreground">
													<strong>Bill ID:</strong> {item.billId}
												</p>
											)}

											{item.parsedData && (
												<div className="rounded border p-3">
													<h5 className="mb-2 font-medium">Extracted Data:</h5>
													<ul className="space-y-1 text-muted-foreground">
														<li>
															<strong>Biller:</strong>{" "}
															{item.parsedData.billerName}
														</li>
														<li>
															<strong>Amount:</strong> $
															{item.parsedData.totalAmount}
														</li>
														<li>
															<strong>Due Date:</strong>{" "}
															{new Date(
																item.parsedData.dueDate,
															).toLocaleDateString()}
														</li>
														{item.parsedData.billType && (
															<li>
																<strong>Type:</strong>{" "}
																{item.parsedData.billType}
															</li>
														)}
														{item.parsedData.accountNumber && (
															<li>
																<strong>Account:</strong>{" "}
																{item.parsedData.accountNumber}
															</li>
														)}
														{item.parsedData.referenceNumber && (
															<li>
																<strong>Reference:</strong>{" "}
																{item.parsedData.referenceNumber}
															</li>
														)}
													</ul>
												</div>
											)}
										</div>
									) : (
										<p className="text-destructive">
											<strong>Error:</strong> {item.error}
										</p>
									)}
								</div>
							))}
						</div>

						{/* Raw Response (for debugging) */}
						<details className="mt-4">
							<summary className="cursor-pointer text-muted-foreground text-sm hover:text-foreground">
								Show Raw Response
							</summary>
							<pre className="mt-2 overflow-auto rounded bg-muted p-2 text-xs">
								{JSON.stringify(result, null, 2)}
							</pre>
						</details>
					</Card>
				)}

				{/* Quick Actions */}
				<Card className="mt-8 p-4">
					<h3 className="mb-3 font-semibold text-lg">🔗 Quick Actions</h3>
					<div className="space-y-2">
						<Button variant="link" className="h-auto justify-start p-0" asChild>
							<a href="/bills">→ View Bills (see created bills)</a>
						</Button>
						<Button variant="link" className="h-auto justify-start p-0" asChild>
							<a
								href="/api/rpc/housemates.getAllHousemates"
								target="_blank"
								rel="noreferrer"
							>
								→ Check Active Housemates (API)
							</a>
						</Button>
						<Button variant="link" className="h-auto justify-start p-0" asChild>
							<a
								href="/api/rpc/bills.getAllBills"
								target="_blank"
								rel="noreferrer"
							>
								→ View All Bills (API)
							</a>
						</Button>
					</div>
				</Card>
			</div>
		</div>
	);
}
