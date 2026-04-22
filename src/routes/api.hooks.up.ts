import { createHmac } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { EvlogError, type RequestLogger, createError } from "evlog";
import { processTransaction } from "../api/services/payment-reconciliation";
import { setApiRequestContext, setApiResponseContext } from "../lib/api-log";
import { getRequestLogger } from "../lib/request-logger";

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

export const Route = createFileRoute("/api/hooks/up")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const log = getRequestLogger() as RequestLogger | undefined;
				setApiRequestContext(log, request, {
					operation: "up_bank_webhook",
				});
				log?.set({
					webhook: {
						provider: "up-bank",
					},
				});

				try {
					const upBankWebhookSecret = process.env.UP_BANK_WEBHOOK_SECRET;
					if (!upBankWebhookSecret) {
						throw createError({
							message: "Webhook secret not configured",
							status: 500,
							why: "UP_BANK_WEBHOOK_SECRET is required to verify webhook signatures.",
							fix: "Set UP_BANK_WEBHOOK_SECRET in the deployment environment.",
						});
					}

					const body = await request.text();
					const signature = request.headers.get("X-Up-Authenticity-Signature");
					log?.set({
						webhook: {
							provider: "up-bank",
							hasSignatureHeader: Boolean(signature),
						},
					});

					if (!signature) {
						throw createError({
							message: "Missing signature header",
							status: 401,
							why: "X-Up-Authenticity-Signature was not present on the webhook request.",
							fix: "Ensure the webhook request comes directly from Up Bank with its authenticity header intact.",
						});
					}

					if (!verifyWebhookSignature(body, signature, upBankWebhookSecret)) {
						log?.warn("Rejected Up Bank webhook with invalid signature");
						throw createError({
							message: "Invalid signature",
							status: 401,
							why: "The webhook signature did not match the configured secret.",
							fix: "Verify UP_BANK_WEBHOOK_SECRET matches the webhook secret configured in Up Bank.",
						});
					}

					let payload: UpBankWebhookPayload;
					try {
						payload = JSON.parse(body) as UpBankWebhookPayload;
					} catch (error) {
						log?.error(error instanceof Error ? error : String(error), {
							webhook: {
								provider: "up-bank",
							},
						});
						throw createError({
							message: "Invalid webhook payload",
							status: 400,
							why: "The Up Bank webhook body was not valid JSON.",
							fix: "Inspect the webhook payload format and ensure the raw body is forwarded unmodified.",
						});
					}

					const eventType = payload.data.attributes.eventType;
					const transactionId = payload.data.relationships.transaction.data.id;
					log?.set({
						webhook: {
							provider: "up-bank",
							eventId: payload.data.id,
							eventType,
							transactionId,
						},
					});

					if (eventType !== "TRANSACTION_CREATED") {
						log?.info("Ignoring unsupported Up Bank webhook event", {
							webhook: {
								provider: "up-bank",
								eventType,
								transactionId,
							},
						});
						setApiResponseContext(
							log,
							{
								contentType: "application/json",
							},
							{
								webhook: {
									provider: "up-bank",
									ignored: true,
									ignoreReason: "unsupported_event_type",
								},
							},
						);
						return Response.json({
							success: true,
							ignored: true,
							reason: "unsupported_event_type",
						});
					}

					const upBankApiToken = process.env.UP_BANK_API_TOKEN;
					if (!upBankApiToken) {
						throw createError({
							message: "API token not configured",
							status: 500,
							why: "UP_BANK_API_TOKEN is required to fetch transaction details from Up Bank.",
							fix: "Set UP_BANK_API_TOKEN in the deployment environment.",
						});
					}

					const transactionUrl = `https://api.up.com.au/api/v1/transactions/${transactionId}`;

					const transactionResponse = await fetch(transactionUrl, {
						headers: {
							Authorization: `Bearer ${upBankApiToken}`,
						},
					});

					if (!transactionResponse.ok) {
						throw createError({
							message: "Failed to fetch transaction",
							status: 502,
							why: `Up Bank returned ${transactionResponse.status} when fetching transaction ${transactionId}.`,
							fix: "Verify the API token is valid and the transaction still exists in Up Bank.",
						});
					}

					const transactionData = await transactionResponse.json();
					const transaction = transactionData.data as UpBankTransaction;

					if (!transaction) {
						throw createError({
							message: "No transaction data found",
							status: 502,
							why: "The Up Bank API response did not include a transaction payload.",
							fix: "Inspect the upstream API response shape and confirm the webhook transaction ID is valid.",
						});
					}

					const amountInCents = transaction.attributes.amount.valueInBaseUnits;
					log?.set({
						transaction: {
							id: transaction.id,
							amountInCents,
							description: transaction.attributes.description,
							rawText: transaction.attributes.rawText,
						},
					});
					if (amountInCents <= 0) {
						log?.info("Ignoring outgoing Up Bank transaction", {
							transaction: {
								id: transaction.id,
								amountInCents,
							},
						});
						setApiResponseContext(
							log,
							{
								contentType: "application/json",
							},
							{
								transaction: {
									id: transaction.id,
									ignored: true,
									ignoreReason: "outgoing_transaction",
								},
							},
						);
						return Response.json({
							success: true,
							ignored: true,
							reason: "outgoing_transaction",
						});
					}

					const result = await processTransaction(transaction);
					log?.set({
						reconciliation: result,
					});
					log?.info("Processed Up Bank transaction", {
						transaction: {
							id: transaction.id,
						},
					});
					setApiResponseContext(log, {
						contentType: "application/json",
					});

					return Response.json({
						success: true,
						reconciliation: result,
						timestamp: new Date().toISOString(),
					});
				} catch (error) {
					const wrappedError =
						error instanceof Error ? error : new Error(String(error));
					log?.error(wrappedError, {
						webhook: {
							provider: "up-bank",
						},
					});

					if (wrappedError instanceof EvlogError) {
						throw wrappedError;
					}

					throw createError({
						message: "Up Bank webhook processing failed",
						status: 500,
						why: wrappedError.message,
						fix: "Inspect the webhook payload, environment configuration, and Up Bank API connectivity.",
					});
				}
			},
		},
	},
});
