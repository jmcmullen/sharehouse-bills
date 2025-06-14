import { auth } from "@sharehouse-bills/api/lib/auth";
import { createServerFileRoute } from "@tanstack/react-start/server";

export const ServerRoute = createServerFileRoute("/api/auth/$").methods({
	GET: async ({ request }) => {
		return auth.handler(request);
	},
	POST: async ({ request }) => {
		return auth.handler(request);
	},
	PUT: async ({ request }) => {
		return auth.handler(request);
	},
	DELETE: async ({ request }) => {
		return auth.handler(request);
	},
	PATCH: async ({ request }) => {
		return auth.handler(request);
	},
	OPTIONS: async ({ request }) => {
		return auth.handler(request);
	},
});
