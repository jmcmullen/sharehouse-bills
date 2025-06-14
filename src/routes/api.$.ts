import { createServerFileRoute } from "@tanstack/react-start/server";
import { auth } from "../api/services/auth";

export const ServerRoute = createServerFileRoute("/api/$").methods({
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
