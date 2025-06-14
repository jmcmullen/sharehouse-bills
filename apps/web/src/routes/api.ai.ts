import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createServerFileRoute } from "@tanstack/react-start/server";
import { streamText } from "ai";

export const ServerRoute = createServerFileRoute("/api/ai").methods({
	POST: async ({ request }) => {
		try {
			const body = await request.json();
			const messages = body.messages || [];

			console.log(
				"API Key exists:",
				!!process.env.GOOGLE_GENERATIVE_AI_API_KEY,
			);
			console.log("Messages:", messages);

			if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
				throw new Error(
					"GOOGLE_GENERATIVE_AI_API_KEY environment variable is not set",
				);
			}

			const google = createGoogleGenerativeAI({
				apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
			});

			const result = streamText({
				model: google("gemini-1.5-flash"),
				messages,
			});

			return new Response(result.toDataStream(), {
				headers: {
					"X-Vercel-AI-Data-Stream": "v1",
					"Content-Type": "text/plain; charset=utf-8",
				},
			});
		} catch (error) {
			console.error("AI API Error:", error);
			const errorMessage =
				error instanceof Error ? error.message : "An error occurred";
			return new Response(JSON.stringify({ error: errorMessage }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			});
		}
	},
});
