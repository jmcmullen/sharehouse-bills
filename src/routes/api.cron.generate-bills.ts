import { createServerFileRoute } from "@tanstack/react-start/server";
import { generateDueBills } from "../api/services/recurring-bill";

export const ServerRoute = createServerFileRoute(
	"/api/cron/generate-bills",
).methods({
	GET: async ({ request }) => {
		try {
			// Verify cron secret for security
			const cronSecret = process.env.CRON_SECRET;
			if (!cronSecret) {
				return new Response("Cron secret not configured", { status: 500 });
			}

			// Check for auth header or query param
			const authHeader = request.headers.get("authorization");
			const url = new URL(request.url);
			const secretParam = url.searchParams.get("secret");

			const providedSecret = authHeader?.replace("Bearer ", "") || secretParam;

			if (!providedSecret || providedSecret !== cronSecret) {
				return new Response("Unauthorized", { status: 401 });
			}

			const result = await generateDueBills(new Date());

			return new Response(
				JSON.stringify({
					success: true,
					result,
					timestamp: new Date().toISOString(),
				}),
				{
					status: 200,
					headers: {
						"Content-Type": "application/json",
					},
				},
			);
		} catch (error) {
			console.error("Error generating recurring bills:", error);
			return new Response(
				JSON.stringify({
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
					timestamp: new Date().toISOString(),
				}),
				{
					status: 500,
					headers: {
						"Content-Type": "application/json",
					},
				},
			);
		}
	},
});
