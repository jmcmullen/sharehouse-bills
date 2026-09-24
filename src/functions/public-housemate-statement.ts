import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { getHousemateStatementData } from "../api/services/housemate-statement.server";

export const getPublicHousemateStatement = createServerFn({ method: "GET" })
	.inputValidator(z.object({ token: z.string().min(1).max(2000) }))
	.handler(async ({ data }) => {
		setResponseHeader("Cache-Control", "private, no-store");
		setResponseHeader("Referrer-Policy", "no-referrer");
		setResponseHeader("X-Robots-Tag", "noindex, nofollow");
		return await getHousemateStatementData(data.token);
	});
