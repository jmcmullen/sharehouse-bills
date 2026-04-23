import type { Register } from "@tanstack/react-router";
import type { RequestHandler } from "@tanstack/react-start/server";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

type ServerEntry = {
	fetch: RequestHandler<Register>;
};

export default createServerEntry({
	async fetch(request) {
		return await handler.fetch(request);
	},
}) satisfies ServerEntry;
