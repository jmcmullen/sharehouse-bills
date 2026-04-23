import { initLog, log } from "evlog/client";

let clientLogInitialized = false;

function ensureClientLog() {
	if (clientLogInitialized || typeof window === "undefined") {
		return;
	}

	initLog({
		service: "sharehouse-bills-client",
		console: true,
		pretty: true,
		minLevel: "info",
	});
	clientLogInitialized = true;
}

export function reportClientError(input: {
	scope: string;
	message: string;
	error: unknown;
	context?: Record<string, unknown>;
}) {
	ensureClientLog();

	const actualError =
		input.error instanceof Error ? input.error : new Error(String(input.error));

	log.error({
		tag: input.scope,
		message: input.message,
		error: {
			name: actualError.name,
			message: actualError.message,
			stack: actualError.stack,
		},
		...(input.context ?? {}),
	});
}
