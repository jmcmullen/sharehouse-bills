import { createFileRoute } from "@tanstack/react-router";
import type { RequestLogger } from "evlog";
import { auth } from "../api/services/auth.server";
import { setApiRequestContext, setApiResponseContext } from "../lib/api-log";
import { getRequestLogger } from "../lib/request-logger";

async function handleAuthRequest(request: Request) {
	const log = getRequestLogger() as RequestLogger | undefined;
	setApiRequestContext(log, request, {
		operation: "auth_proxy",
	});
	const response = await auth.handler(request);
	setApiResponseContext(
		log,
		{
			contentType: response.headers.get("content-type"),
		},
		{
			auth: {
				proxied: true,
			},
		},
	);
	return response;
}

export const Route = createFileRoute("/api/auth/$")({
	server: {
		handlers: {
			GET: async ({ request }) => handleAuthRequest(request),
			POST: async ({ request }) => handleAuthRequest(request),
			PUT: async ({ request }) => handleAuthRequest(request),
			DELETE: async ({ request }) => handleAuthRequest(request),
			PATCH: async ({ request }) => handleAuthRequest(request),
			OPTIONS: async ({ request }) => handleAuthRequest(request),
		},
	},
});
