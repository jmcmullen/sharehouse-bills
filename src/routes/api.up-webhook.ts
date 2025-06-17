import { createHmac } from "node:crypto";
import { createServerFileRoute } from "@tanstack/react-start/server";
import { processTransaction } from "../api/services/payment-reconciliation";

interface UpBankTransaction {
	type: string;
	id: string;
	attributes: {
		status: string;
		rawText: string;
		description: string;
		message: string | null;
		isCategorizable: boolean;
		holdInfo: {
			amount: {
				currencyCode: string;
				value: string;
				valueInBaseUnits: number;
			};
			foreignAmount: {
				currencyCode: string;
				value: string;
				valueInBaseUnits: number;
			} | null;
		} | null;
		roundUp: {
			amount: {
				currencyCode: string;
				value: string;
				valueInBaseUnits: number;
			};
			boostPortion: {
				currencyCode: string;
				value: string;
				valueInBaseUnits: number;
			} | null;
		} | null;
		cashback: {
			amount: {
				currencyCode: string;
				value: string;
				valueInBaseUnits: number;
			};
			description: string;
		} | null;
		amount: {
			currencyCode: string;
			value: string;
			valueInBaseUnits: number;
		};
		foreignAmount: {
			currencyCode: string;
			value: string;
			valueInBaseUnits: number;
		} | null;
		cardPurchaseMethod: {
			method: string;
			cardNumberSuffix: string | null;
		} | null;
		settledAt: string;
		createdAt: string;
	};
	relationships: {
		account: {
			data: {
				type: string;
				id: string;
			};
		};
		category: {
			data: {
				type: string;
				id: string;
			} | null;
		};
		parentCategory: {
			data: {
				type: string;
				id: string;
			} | null;
		};
		tags: {
			data: Array<{
				type: string;
				id: string;
			}>;
		};
	};
}

interface UpBankWebhookPayload {
	data: {
		type: string;
		id: string;
		attributes: {
			eventType: string;
			createdAt: string;
		};
		relationships: {
			webhook: {
				data: {
					type: string;
					id: string;
				};
				links?: {
					related: string;
				};
			};
			transaction: {
				data: {
					type: string;
					id: string;
				};
				links?: {
					related: string;
				};
			};
		};
	};
}

function verifyWebhookSignature(
	body: string,
	signature: string,
	secret: string,
): boolean {
	const computedSignature = createHmac("sha256", secret)
		.update(body)
		.digest("hex");
	return signature === computedSignature;
}

export const ServerRoute = createServerFileRoute("/api/up-webhook").methods({
	POST: async ({ request }) => {
		try {
			const upBankWebhookSecret = process.env.UP_BANK_WEBHOOK_SECRET;
			if (!upBankWebhookSecret) {
				console.error("UP_BANK_WEBHOOK_SECRET not configured");
				return new Response(
					JSON.stringify({ error: "Webhook secret not configured" }),
					{ status: 500, headers: { "Content-Type": "application/json" } },
				);
			}

			// Get the raw body and signature
			const body = await request.text();
			const signature = request.headers.get("X-Up-Authenticity-Signature");

			if (!signature) {
				console.error("Missing X-Up-Authenticity-Signature header");
				return new Response(
					JSON.stringify({ error: "Missing signature header" }),
					{ status: 401, headers: { "Content-Type": "application/json" } },
				);
			}

			// Verify webhook signature
			if (!verifyWebhookSignature(body, signature, upBankWebhookSecret)) {
				console.error("Invalid webhook signature");
				return new Response(JSON.stringify({ error: "Invalid signature" }), {
					status: 401,
					headers: { "Content-Type": "application/json" },
				});
			}

			// Parse the webhook payload
			const payload: UpBankWebhookPayload = JSON.parse(body);

			// Only process  events to avoid duplicate processing
			if (payload.data.attributes.eventType !== "TRANSACTION_CREATED") {
				console.log(
					`Ignoring event type: ${payload.data.attributes.eventType} (only processing CREATED events)`,
				);
				return new Response(JSON.stringify({ success: true }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}

			// Get Up Bank API token
			const upBankApiToken = process.env.UP_BANK_API_TOKEN;
			if (!upBankApiToken) {
				console.error("UP_BANK_API_TOKEN not configured");
				return new Response(
					JSON.stringify({ error: "API token not configured" }),
					{ status: 500, headers: { "Content-Type": "application/json" } },
				);
			}

			// Fetch transaction details from Up Bank API
			const transactionId = payload.data.relationships.transaction.data.id;
			const transactionUrl = `https://api.up.com.au/api/v1/transactions/${transactionId}`;

			const transactionResponse = await fetch(transactionUrl, {
				headers: {
					Authorization: `Bearer ${upBankApiToken}`,
				},
			});

			if (!transactionResponse.ok) {
				console.error(
					`Failed to fetch transaction ${transactionId}: ${transactionResponse.status}`,
				);
				return new Response(
					JSON.stringify({ error: "Failed to fetch transaction" }),
					{ status: 500, headers: { "Content-Type": "application/json" } },
				);
			}

			const transactionData = await transactionResponse.json();
			const transaction = transactionData.data as UpBankTransaction;

			if (!transaction) {
				console.error("No transaction data found in API response");
				return new Response(
					JSON.stringify({ error: "No transaction data found" }),
					{ status: 400, headers: { "Content-Type": "application/json" } },
				);
			}

			// Only process incoming transactions (positive amounts)
			const amountInCents = transaction.attributes.amount.valueInBaseUnits;
			if (amountInCents <= 0) {
				console.log(`Ignoring outgoing transaction: ${transaction.id}`);
				return new Response(JSON.stringify({ success: true }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}

			// Process the transaction for payment reconciliation
			const result = await processTransaction(transaction);

			console.log(`Processed transaction ${transaction.id}:`, result);

			return new Response(
				JSON.stringify({
					success: true,
					reconciliation: result,
					timestamp: new Date().toISOString(),
				}),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			);
		} catch (error) {
			console.error("Up Bank webhook error:", error);
			return new Response(
				JSON.stringify({
					error: "Internal server error",
					timestamp: new Date().toISOString(),
				}),
				{
					status: 500,
					headers: {
						"Content-Type": "application/json",
					},
				},
			);
		}
	},
});
