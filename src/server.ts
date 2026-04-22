import type { Register } from "@tanstack/react-router";
import { defaultStreamHandler } from "@tanstack/react-start-server";
import type { RequestHandler } from "@tanstack/start-server-core";
import { createStartHandler } from "@tanstack/start-server-core";

const fetch = createStartHandler(defaultStreamHandler);

type ServerEntry = {
	fetch: RequestHandler<Register>;
};

export default {
	async fetch(...args) {
		return await fetch(...args);
	},
} satisfies ServerEntry;
