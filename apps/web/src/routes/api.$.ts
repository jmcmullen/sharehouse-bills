import { RPCHandler } from "@orpc/server/fetch";
import { router } from "@sharehouse-bills/api/index";
import { auth } from "@sharehouse-bills/api/lib/auth";
import { createContext } from "@sharehouse-bills/api/lib/context";
import { createServerFileRoute } from "@tanstack/react-start/server";

const rpcHandler = new RPCHandler(router);

export const ServerRoute = createServerFileRoute("/api/$").methods({
	GET: async ({ request }) => {
		const url = new URL(request.url);

		// Handle ORPC routes
		if (url.pathname.startsWith("/api/rpc")) {
			const context = await createContext({ req: request });
			const { response } = await rpcHandler.handle(request, {
				prefix: "/api/rpc",
				context,
			});
			return response ?? new Response("Not Found", { status: 404 });
		}

		// Handle all other /api/* routes with Better Auth
		return auth.handler(request);
	},
	POST: async ({ request }) => {
		const url = new URL(request.url);

		// Handle ORPC routes
		if (url.pathname.startsWith("/api/rpc")) {
			const context = await createContext({ req: request });
			const { response } = await rpcHandler.handle(request, {
				prefix: "/api/rpc",
				context,
			});
			return response ?? new Response("Not Found", { status: 404 });
		}

		// Handle all other /api/* routes with Better Auth
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
