import type { Context as HonoContext } from "hono";
import { auth } from "./auth";

export type CreateContextOptions = {
	context?: HonoContext;
	req?: Request;
};

export async function createContext({ context, req }: CreateContextOptions) {
	const headers = context ? context.req.raw.headers : req?.headers;

	if (!headers) {
		throw new Error("Either context or req must be provided");
	}

	const session = await auth.api.getSession({
		headers,
	});

	return {
		session,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
