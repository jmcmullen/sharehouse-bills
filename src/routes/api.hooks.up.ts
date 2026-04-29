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
			transaction?: {
				data?: {
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

function buildBodyPreview(body: string, maxLength = 500) {
	const normalizedBody = body.replace(/\s+/g, " ").trim();
	if (normalizedBody.length <= maxLength) {
		return normalizedBody;
	}

	return `${normalizedBody.slice(0, maxLength - 1)}…`;
}

function getRequiredEnvironmentValue(input: {
	name: string;
	message: string;
	why: string;
}) {
	const value = process.env[input.name];
	if (value) {
		return value;
	}

	throw createError({
		message: input.message,
		status: 500,
		why: input.why,
		fix: `Set ${input.name} in the deployment environment.`,
	});
}

function parseUpBankPayload(body: string, log: RequestLogger | undefined) {
	try {
		return JSON.parse(body) as UpBankWebhookPayload;
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
}

async function readVerifiedUpBankPayload(
	request: Request,
	log: RequestLogger | undefined,
) {
	const upBankWebhookSecret = getRequiredEnvironmentValue({
		name: "UP_BANK_WEBHOOK_SECRET",
		message: "Webhook secret not configured",
		why: "UP_BANK_WEBHOOK_SECRET is required to verify webhook signatures.",
	});
	const body = await request.text();
	const signature = request.headers.get("X-Up-Authenticity-Signature");
	log?.set({
		request: {
			bodyPreview: buildBodyPreview(body),
		},
		webhook: {
			provider: "up-bank",
			hasSignatureHeader: Boolean(signature),
			signatureLength: signature?.length ?? 0,
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

	return parseUpBankPayload(body, log);
}

function logUpBankWebhookPayload(
	log: RequestLogger | undefined,
	payload: UpBankWebhookPayload,
) {
	const transactionId =
		payload.data.relationships.transaction?.data?.id ?? null;
	log?.set({
		webhook: {
			provider: "up-bank",
			eventId: payload.data.id,
			eventType: payload.data.attributes.eventType,
			eventCreatedAt: payload.data.attributes.createdAt,
			webhookId: payload.data.relationships.webhook.data.id,
			hasTransactionRelationship: Boolean(
				payload.data.relationships.transaction?.data,
			),
			transactionId,
		},
	});

	return transactionId;
}

function ignoredWebhookResponse(
	log: RequestLogger | undefined,
	reason: string,
	context: Record<string, unknown>,
) {
	setApiResponseContext(
		log,
		{
			contentType: "application/json",
		},
		context,
	);
	return Response.json({
		success: true,
		ignored: true,
		reason,
	});
}

async function fetchUpBankTransaction(
	transactionId: string,
	log: RequestLogger | undefined,
) {
	const upBankApiToken = getRequiredEnvironmentValue({
		name: "UP_BANK_API_TOKEN",
		message: "API token not configured",
		why: "UP_BANK_API_TOKEN is required to fetch transaction details from Up Bank.",
	});
	const transactionUrl = `https://api.up.com.au/api/v1/transactions/${transactionId}`;
	const transactionResponse = await fetch(transactionUrl, {
		headers: {
			Authorization: `Bearer ${upBankApiToken}`,
		},
	});
	const transactionResponseText = await transactionResponse.text();
	log?.set({
		upBank: {
			transactionFetch: {
				url: transactionUrl,
				status: transactionResponse.status,
				ok: transactionResponse.ok,
				bodyPreview: buildBodyPreview(transactionResponseText),
			},
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

	const transactionData = JSON.parse(transactionResponseText) as {
		data?: UpBankTransaction;
	};
	if (!transactionData.data) {
		throw createError({
			message: "No transaction data found",
			status: 502,
			why: "The Up Bank API response did not include a transaction payload.",
			fix: "Inspect the upstream API response shape and confirm the webhook transaction ID is valid.",
		});
	}

	return transactionData.data;
}

function logUpBankTransaction(
	log: RequestLogger | undefined,
	transaction: UpBankTransaction,
) {
	log?.set({
		transaction: {
			id: transaction.id,
			type: transaction.type,
			status: transaction.attributes.status,
			amountInCents: transaction.attributes.amount.valueInBaseUnits,
			currencyCode: transaction.attributes.amount.currencyCode,
			createdAt: transaction.attributes.createdAt,
			settledAt: transaction.attributes.settledAt,
			description: transaction.attributes.description,
			message: transaction.attributes.message,
			rawText: transaction.attributes.rawText,
			isCategorizable: transaction.attributes.isCategorizable,
			accountId: transaction.relationships.account.data.id,
		},
	});
}

function wrapUpBankWebhookError(
	error: unknown,
	log: RequestLogger | undefined,
) {
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

async function handleUpBankWebhook(request: Request) {
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
		const payload = await readVerifiedUpBankPayload(request, log);
		const eventType = payload.data.attributes.eventType;
		const transactionId = logUpBankWebhookPayload(log, payload);

		if (eventType !== "TRANSACTION_CREATED") {
			log?.info("Ignoring unsupported Up Bank webhook event", {
				webhook: {
					provider: "up-bank",
					eventType,
					transactionId,
				},
			});
			return ignoredWebhookResponse(log, "unsupported_event_type", {
				webhook: {
					provider: "up-bank",
					ignored: true,
					ignoreReason: "unsupported_event_type",
				},
			});
		}

		if (!transactionId) {
			throw createError({
				message: "Missing transaction relationship",
				status: 400,
				why: `Up Bank webhook event ${eventType} did not include a transaction relationship.`,
				fix: "Inspect the webhook payload shape and only process transaction-backed Up Bank events here.",
			});
		}

		const transaction = await fetchUpBankTransaction(transactionId, log);
		logUpBankTransaction(log, transaction);

		const amountInCents = transaction.attributes.amount.valueInBaseUnits;
		if (amountInCents <= 0) {
			log?.info("Ignoring outgoing Up Bank transaction", {
				transaction: {
					id: transaction.id,
					amountInCents,
				},
			});
			return ignoredWebhookResponse(log, "outgoing_transaction", {
				transaction: {
					id: transaction.id,
					ignored: true,
					ignoreReason: "outgoing_transaction",
				},
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
		wrapUpBankWebhookError(error, log);
	}
}

export const Route = createFileRoute("/api/hooks/up")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				return await handleUpBankWebhook(request);
			},
		},
	},
});
