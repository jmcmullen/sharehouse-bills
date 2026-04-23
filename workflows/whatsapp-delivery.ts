import { FatalError, RetryableError, getStepMetadata } from "workflow";
import { emitWorkflowDeliveryEvent } from "./workflow-log";

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

function getErrorStatus(error: unknown) {
	return typeof error === "object" &&
		error !== null &&
		"status" in error &&
		typeof error.status === "number"
		? error.status
		: null;
}

function getRetryAfter(error: unknown) {
	if (
		typeof error === "object" &&
		error !== null &&
		"retryAfter" in error &&
		typeof error.retryAfter === "string"
	) {
		const retryAfterSeconds = Number(error.retryAfter);
		if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
			return retryAfterSeconds * 1000;
		}

		const retryAt = Date.parse(error.retryAfter);
		if (Number.isFinite(retryAt)) {
			return Math.max(1_000, retryAt - Date.now());
		}
	}

	return null;
}

function toWorkflowDeliveryError(error: unknown, operation: string) {
	if (error instanceof FatalError || error instanceof RetryableError) {
		return error;
	}

	const errorMessage = getErrorMessage(error);
	const status = getErrorStatus(error);
	const { attempt } = getStepMetadata();
	const fallbackRetryAfterMs = Math.min(30_000, 1_000 * 2 ** (attempt - 1));

	if (errorMessage.includes("is not configured")) {
		return new FatalError(`${operation} failed: ${errorMessage}`);
	}

	if (status === 400 || status === 401 || status === 403 || status === 404) {
		return new FatalError(`${operation} failed: ${errorMessage}`);
	}

	if (status === 409 || status === 410 || status === 422) {
		return new FatalError(`${operation} failed: ${errorMessage}`);
	}

	if (status === 408 || status === 429 || (status !== null && status >= 500)) {
		return new RetryableError(`${operation} failed: ${errorMessage}`, {
			retryAfter: getRetryAfter(error) ?? fallbackRetryAfterMs,
		});
	}

	if (
		typeof error === "object" &&
		error !== null &&
		"name" in error &&
		error.name === "WahaRequestError"
	) {
		return new RetryableError(`${operation} failed: ${errorMessage}`, {
			retryAfter: getRetryAfter(error) ?? fallbackRetryAfterMs,
		});
	}

	return new RetryableError(`${operation} failed: ${errorMessage}`, {
		retryAfter: fallbackRetryAfterMs,
	});
}

export async function performTrackedWhatsappDelivery(input: {
	notificationId: string;
	deliveryKey: string;
	operation: string;
	deliver: () => Promise<{ messageId?: string | null } | undefined>;
}) {
	const { stepId } = getStepMetadata();
	const {
		markWhatsappNotificationDeliveryRetryable,
		markWhatsappNotificationDeliverySent,
		reserveWhatsappNotificationDelivery,
	} = await import("../src/api/services/whatsapp-notifications");

	const reservation = await reserveWhatsappNotificationDelivery(
		input.notificationId,
		input.deliveryKey,
		stepId,
	);

	if (reservation.outcome === "already_sent") {
		emitWorkflowDeliveryEvent({
			notificationId: input.notificationId,
			deliveryKey: input.deliveryKey,
			operation: input.operation,
			message: `${input.operation} already sent; deduplicated`,
			outcome: "deduplicated",
		});
		return {
			sent: true,
			deduplicated: true,
		};
	}

	if (reservation.outcome === "indeterminate") {
		const error = new FatalError(
			`${input.operation} is already in progress for notification ${input.notificationId}; refusing to resend because delivery may have already reached WhatsApp.`,
		);
		emitWorkflowDeliveryEvent({
			notificationId: input.notificationId,
			deliveryKey: input.deliveryKey,
			operation: input.operation,
			message: `${input.operation} delivery is already in progress`,
			outcome: "indeterminate",
			error,
		});
		throw error;
	}

	try {
		const response = await input.deliver();
		await markWhatsappNotificationDeliverySent({
			notificationId: input.notificationId,
			deliveryKey: input.deliveryKey,
			stepId,
			messageId:
				response &&
				typeof response === "object" &&
				"messageId" in response &&
				typeof response.messageId === "string"
					? response.messageId
					: null,
		});
		emitWorkflowDeliveryEvent({
			notificationId: input.notificationId,
			deliveryKey: input.deliveryKey,
			operation: input.operation,
			message: `${input.operation} sent`,
			outcome: "sent",
		});

		return {
			sent: true,
			deduplicated: false,
		};
	} catch (error) {
		await markWhatsappNotificationDeliveryRetryable({
			notificationId: input.notificationId,
			deliveryKey: input.deliveryKey,
			stepId,
			errorMessage: getErrorMessage(error),
		});
		const workflowError = toWorkflowDeliveryError(error, input.operation);
		emitWorkflowDeliveryEvent({
			notificationId: input.notificationId,
			deliveryKey: input.deliveryKey,
			operation: input.operation,
			message: `${input.operation} failed`,
			outcome: workflowError instanceof RetryableError ? "retryable" : "fatal",
			error: workflowError,
		});
		throw workflowError;
	}
}
