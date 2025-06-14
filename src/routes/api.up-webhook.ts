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
			};
			transaction: {
				data: {
					type: string;
					id: string;
				};
			};
		};
	};
	included?: UpBankTransaction[];
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

			// Only process TRANSACTION_SETTLED events to avoid duplicate processing
			// TRANSACTION_CREATED fires first, then TRANSACTION_SETTLED when finalized
			if (payload.data.attributes.eventType !== "TRANSACTION_SETTLED") {
				console.log(
					`Ignoring event type: ${payload.data.attributes.eventType} (only processing SETTLED events)`,
				);
				return new Response(JSON.stringify({ success: true }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}

			// Extract transaction data from included array
			const transaction = payload.included?.find(
				(item) => item.type === "transactions",
			);

			if (!transaction) {
				console.error("No transaction data found in webhook payload");
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
