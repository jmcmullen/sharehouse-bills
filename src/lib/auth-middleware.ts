import { redirect } from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";
import { getWebRequest } from "@tanstack/react-start/server";
import { auth } from "../api/services/auth";

/**
 * Authentication middleware for server functions
 * Checks if the user is authenticated and throws a redirect if not
 * Provides the authenticated session in the context for use by other middleware and server functions
 */
export const authMiddleware = createMiddleware({ type: "function" }).server(
	async ({ next }) => {
		const request = getWebRequest();
		const session = await auth.api.getSession({ headers: request.headers });

		if (!session?.user) {
			throw redirect({
				to: "/login",
			});
		}

		// Pass the session data to the next middleware/server function
		return next({
			context: {
				session,
				user: session.user,
			},
		});
	},
);
