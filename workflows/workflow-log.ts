import { type RequestLogger, createRequestLogger } from "evlog";
import {
	FatalError,
	RetryableError,
	getStepMetadata,
	getWorkflowMetadata,
} from "workflow";

type WorkflowStepLogger = RequestLogger<{
	workflow: {
		name: string;
		notificationId: string;
		runId: string;
		outcome?: "completed" | "failed" | "ignored";
		reason?: string;
	};
	workflowStep: {
		name: string;
		stepId: string;
		attempt: number;
	};
	whatsappDelivery?: {
		key: string;
		operation: string;
		outcome: "sent" | "deduplicated" | "indeterminate" | "retryable" | "fatal";
		retryAfter: string | number | null;
		isFatal: boolean;
		isRetryable: boolean;
	};
}>;

function createWorkflowStepLogger(input: {
	workflowName: string;
	notificationId: string;
	stepName: string;
}) {
	const { stepId, attempt } = getStepMetadata();
	const { workflowRunId } = getWorkflowMetadata();

	const log = createRequestLogger(
		{
			method: "WORKFLOW_STEP",
			path: `/workflows/${input.workflowName}/${input.stepName}`,
		},
		{
			_deferDrain: true,
		},
	) as WorkflowStepLogger;

	log.set({
		operation: `${input.workflowName}:${input.stepName}`,
		workflow: {
			name: input.workflowName,
			notificationId: input.notificationId,
			runId: workflowRunId,
		},
		workflowStep: {
			name: input.stepName,
			stepId,
			attempt,
		},
	});

	return log;
}

export function toLoggedError(error: unknown) {
	return error instanceof Error ? error : new Error(String(error));
}

function getRetryAfterValue(error: RetryableError) {
	const retryAfter =
		typeof error === "object" &&
		error !== null &&
		"retryAfter" in error &&
		(typeof error.retryAfter === "number" ||
			typeof error.retryAfter === "string" ||
			error.retryAfter instanceof Date)
			? error.retryAfter
			: null;

	if (typeof retryAfter === "number" || typeof retryAfter === "string") {
		return retryAfter;
	}

	if (retryAfter instanceof Date) {
		return retryAfter.toISOString();
	}

	return null;
}

export function emitWorkflowOutcome(input: {
	workflowName: string;
	notificationId: string;
	stepName: string;
	outcome: "completed" | "failed" | "ignored";
	message: string;
	context?: Record<string, unknown>;
}) {
	const log = createWorkflowStepLogger(input);
	if (input.context) {
		log.set(input.context);
	}

	log.set({
		workflow: {
			...(log.getContext().workflow ?? {}),
			outcome: input.outcome,
			reason: input.message,
		},
	});

	if (input.outcome === "completed") {
		log.info(input.message);
	} else if (input.outcome === "ignored") {
		log.warn(input.message);
	} else {
		log.error(new Error(input.message));
	}

	log.emit({
		_forceKeep: true,
	});
}

export function emitWorkflowDeliveryEvent(input: {
	notificationId: string;
	deliveryKey: string;
	operation: string;
	message: string;
	outcome: "sent" | "deduplicated" | "indeterminate" | "retryable" | "fatal";
	error?: unknown;
	context?: Record<string, unknown>;
}) {
	const log = createWorkflowStepLogger({
		workflowName: "whatsapp-delivery",
		notificationId: input.notificationId,
		stepName: input.deliveryKey,
	});
	const actualError = input.error ? toLoggedError(input.error) : null;
	const retryableError =
		actualError instanceof RetryableError ? actualError : null;

	log.set({
		whatsappDelivery: {
			key: input.deliveryKey,
			operation: input.operation,
			outcome: input.outcome,
			retryAfter:
				retryableError instanceof RetryableError
					? getRetryAfterValue(retryableError)
					: null,
			isFatal: actualError instanceof FatalError,
			isRetryable: retryableError instanceof RetryableError,
		},
		...(input.context ?? {}),
	});

	if (actualError) {
		log.error(actualError, {
			workflow: {
				...(log.getContext().workflow ?? {}),
				outcome: "failed",
				reason: input.message,
			},
		});
	} else if (
		input.outcome === "deduplicated" ||
		input.outcome === "indeterminate" ||
		input.outcome === "fatal"
	) {
		log.warn(input.message);
	} else {
		log.info(input.message);
	}

	log.emit({
		_forceKeep: true,
	});
}
