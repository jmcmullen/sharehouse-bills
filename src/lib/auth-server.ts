import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { auth } from "../api/services/auth";

export const serverAuth = createServerFn({ method: "GET" }).handler(
	async () => {
		const request = getRequest();
		const session = await auth.api.getSession({
			headers: request.headers,
		});
		return { session };
	},
);

// export async function getSession() {
// 	const request = getRequest();
// 	const session = await auth.api.getSession({ headers: request.headers });
// 	return session;
// }

// export async function requireSession() {
// 	const session = await getSession();
// 	if (!session) {
// 		throw new Error("Unauthorized");
// 	}
// 	return session;
// }
