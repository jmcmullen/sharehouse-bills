import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/test-webhook")({
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
		<div className="min-h-screen bg-gray-900 text-white">
			<div className="container mx-auto max-w-2xl px-4 py-8">
				<h1 className="mb-8 font-bold text-3xl text-white">
					Test PDF Bill Processing
				</h1>

				<div className="mb-6 rounded-lg border border-blue-600 bg-blue-900/50 p-4">
					<h2 className="mb-2 font-semibold text-blue-300 text-lg">
						📋 Instructions
					</h2>
					<ul className="space-y-1 text-blue-200 text-sm">
						<li>• Upload a PDF bill (electricity, gas, internet, etc.)</li>
						<li>• The AI will extract: biller name, amount, due date</li>
						<li>• A bill will be created and split among active housemates</li>
						<li>• Make sure you have active housemates in the system first!</li>
					</ul>
				</div>

				<form
					onSubmit={handleSubmit}
					className="space-y-4 rounded-lg bg-gray-800 p-6 shadow-md"
				>
					<div>
						<label
							htmlFor="from"
							className="mb-2 block font-medium text-gray-300 text-sm"
						>
							From Email
						</label>
						<input
							id="from"
							type="email"
							name="from"
							defaultValue="test@example.com"
							required
							className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>

					<div>
						<label
							htmlFor="subject"
							className="mb-2 block font-medium text-gray-300 text-sm"
						>
							Email Subject
						</label>
						<input
							id="subject"
							type="text"
							name="subject"
							defaultValue="Test Bill - December 2024"
							required
							className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>

					<input type="hidden" name="attachments" value="1" />

					<div>
						<label
							htmlFor="attachment1"
							className="mb-2 block font-medium text-gray-300 text-sm"
						>
							PDF Bill File
						</label>
						<input
							id="attachment1"
							type="file"
							name="attachment1"
							accept=".pdf"
							required
							className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-white file:mr-4 file:rounded-md file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:font-semibold file:text-sm file:text-white hover:file:bg-blue-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>

					<button
						type="submit"
						disabled={isProcessing}
						className={`w-full rounded-md px-4 py-2 font-medium ${
							isProcessing
								? "cursor-not-allowed bg-gray-600"
								: "bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500"
						} text-white transition-colors`}
					>
						{isProcessing ? (
							<>
								<span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-white border-b-2" />
								Processing PDF...
							</>
						) : (
							"🤖 Process PDF Bill"
						)}
					</button>
				</form>

				{/* Results Display */}
				{error && (
					<div className="mt-6 rounded-lg border border-red-500 bg-red-900/50 p-4">
						<h3 className="mb-2 font-semibold text-lg text-red-300">
							❌ Error
						</h3>
						<p className="text-red-200">{error}</p>
					</div>
				)}

				{result && (
					<div className="mt-6 rounded-lg border border-green-500 bg-green-900/50 p-4">
						<h3 className="mb-4 font-semibold text-green-300 text-lg">
							✅ Processing Complete
						</h3>

						<div className="space-y-4">
							<div>
								<p className="text-green-200">
									<strong>Status:</strong> {result.message}
								</p>
							</div>

							{result.results?.map((item, index) => (
								<div
									key={`${item.filename}-${index}`}
									className="border-green-500 border-t pt-4"
								>
									<h4 className="mb-2 font-medium text-green-300">
										📄 {item.filename}
									</h4>

									{item.success ? (
										<div className="space-y-2 text-sm">
											{item.billId && (
												<p className="text-white">
													<strong>Bill ID:</strong> {item.billId}
												</p>
											)}

											{item.parsedData && (
												<div className="rounded border border-gray-600 bg-gray-800 p-3">
													<h5 className="mb-2 font-medium text-white">
														Extracted Data:
													</h5>
													<ul className="space-y-1 text-gray-300">
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
										<p className="text-red-400">
											<strong>Error:</strong> {item.error}
										</p>
									)}
								</div>
							))}
						</div>

						{/* Raw Response (for debugging) */}
						<details className="mt-4">
							<summary className="cursor-pointer text-green-300 text-sm hover:text-green-100">
								Show Raw Response
							</summary>
							<pre className="mt-2 overflow-auto rounded bg-gray-800 p-2 text-gray-300 text-xs">
								{JSON.stringify(result, null, 2)}
							</pre>
						</details>
					</div>
				)}

				{/* Quick Actions */}
				<div className="mt-8 rounded-lg bg-gray-800 p-4">
					<h3 className="mb-3 font-semibold text-gray-200 text-lg">
						🔗 Quick Actions
					</h3>
					<div className="space-y-2">
						<a
							href="/dashboard"
							className="block text-blue-400 underline hover:text-blue-300"
						>
							→ View Dashboard (see created bills)
						</a>
						<a
							href="/api/rpc/housemates.getAllHousemates"
							target="_blank"
							className="block text-blue-400 underline hover:text-blue-300"
							rel="noreferrer"
						>
							→ Check Active Housemates (API)
						</a>
						<a
							href="/api/rpc/bills.getAllBills"
							target="_blank"
							className="block text-blue-400 underline hover:text-blue-300"
							rel="noreferrer"
						>
							→ View All Bills (API)
						</a>
					</div>
				</div>
			</div>
		</div>
	);
}
