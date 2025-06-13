import { RPCHandler } from "@orpc/server/fetch";
import { router } from "@sharehouse-bills/api";
import { createContext } from "@sharehouse-bills/api/lib";
import { createServerFileRoute } from "@tanstack/react-start/server";

const handler = new RPCHandler(router);

export const ServerRoute = createServerFileRoute("/api/rpc/$").methods({
	GET: async ({ request }) => {
		const context = await createContext({ req: request });
		const { response } = await handler.handle(request, {
			prefix: "/api/rpc",
			context,
		});
		return response ?? new Response("Not Found", { status: 404 });
	},
	POST: async ({ request }) => {
		const context = await createContext({ req: request });
		const { response } = await handler.handle(request, {
			prefix: "/api/rpc",
			context,
		});
		return response ?? new Response("Not Found", { status: 404 });
	},
	PUT: async ({ request }) => {
		const context = await createContext({ req: request });
		const { response } = await handler.handle(request, {
			prefix: "/api/rpc",
			context,
		});
		return response ?? new Response("Not Found", { status: 404 });
	},
	DELETE: async ({ request }) => {
		const context = await createContext({ req: request });
		const { response } = await handler.handle(request, {
			prefix: "/api/rpc",
			context,
		});
		return response ?? new Response("Not Found", { status: 404 });
	},
	PATCH: async ({ request }) => {
		const context = await createContext({ req: request });
		const { response } = await handler.handle(request, {
			prefix: "/api/rpc",
			context,
		});
		return response ?? new Response("Not Found", { status: 404 });
	},
});
