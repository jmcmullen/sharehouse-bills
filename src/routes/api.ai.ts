import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createFileRoute } from "@tanstack/react-router";
import { streamText } from "ai";
import { type RequestLogger, createError } from "evlog";
import { setApiRequestContext, setApiResponseContext } from "../lib/api-log";
import { getRequestLogger } from "../lib/request-logger";

export const Route = createFileRoute("/api/ai")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const log = getRequestLogger() as RequestLogger | undefined;
				setApiRequestContext(log, request, {
					operation: "ai_chat",
				});
				try {
					const body = await request.json();
					const messages = body.messages || [];
					log?.set({
						ai: {
							model: "gemini-1.5-flash",
							messageCount: Array.isArray(messages) ? messages.length : 0,
						},
					});

					if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
						throw createError({
							message:
								"GOOGLE_GENERATIVE_AI_API_KEY environment variable is not set",
							status: 500,
							why: "The AI route requires GOOGLE_GENERATIVE_AI_API_KEY to call Google Generative AI.",
							fix: "Set GOOGLE_GENERATIVE_AI_API_KEY in the deployment environment.",
						});
					}

					const google = createGoogleGenerativeAI({
						apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
					});

					const result = streamText({
						model: google("gemini-1.5-flash"),
						messages,
					});
					setApiResponseContext(
						log,
						{
							contentType: "text/plain; charset=utf-8",
							streamed: true,
						},
						{
							ai: {
								streamType: "vercel-ai-data-stream",
							},
						},
					);

					return new Response(result.toDataStream(), {
						headers: {
							"X-Vercel-AI-Data-Stream": "v1",
							"Content-Type": "text/plain; charset=utf-8",
						},
					});
				} catch (error) {
					log?.error(error instanceof Error ? error : String(error), {
						operation: "ai_chat",
					});
					throw error;
				}
			},
		},
	},
});
