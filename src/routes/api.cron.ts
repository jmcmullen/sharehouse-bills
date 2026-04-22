import { createFileRoute } from "@tanstack/react-router";
import { type RequestLogger, createError } from "evlog";
import { enqueueDueBillReminders } from "../api/services/bill-reminder";
import { generateDueBills } from "../api/services/recurring-bill";
import { setApiRequestContext, setApiResponseContext } from "../lib/api-log";
import { getRequestLogger } from "../lib/request-logger";

export const Route = createFileRoute("/api/cron")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const log = getRequestLogger() as RequestLogger | undefined;
				setApiRequestContext(log, request, {
					operation: "cron_generate_bills",
				});
				const url = new URL(request.url);
				const authHeader = request.headers.get("authorization");
				const secretParam = url.searchParams.get("secret");
				const providedSecret =
					authHeader?.replace("Bearer ", "") || secretParam;

				log?.set({
					cron: {
						job: "generate-bills",
						hasAuthorizationHeader: Boolean(authHeader),
						hasSecretQueryParam: Boolean(secretParam),
					},
				});

				const cronSecret = process.env.CRON_SECRET;
				if (!cronSecret) {
					throw createError({
						message: "Cron secret not configured",
						status: 500,
						why: "The recurring bill generation endpoint requires CRON_SECRET.",
						fix: "Set the CRON_SECRET environment variable for this deployment.",
					});
				}

				if (!providedSecret || providedSecret !== cronSecret) {
					throw createError({
						message: "Unauthorized",
						status: 401,
						why: "The provided cron secret was missing or invalid.",
						fix: "Send the CRON_SECRET via a Bearer token or the secret query parameter.",
					});
				}

				const generatedBills = await generateDueBills(new Date());
				const reminders = await enqueueDueBillReminders(new Date());
				log?.set({
					cron: {
						job: "generate-bills-and-reminders",
						generatedCount: generatedBills.generated,
						reminderCount: reminders.scheduledCount,
					},
				});
				setApiResponseContext(log, {
					contentType: "application/json",
				});

				return Response.json({
					success: true,
					result: {
						generatedBills,
						reminders,
					},
					timestamp: new Date().toISOString(),
				});
			},
		},
	},
});
