import { createServerFn } from "@tanstack/react-start";
import { getWebRequest } from "@tanstack/react-start/server";
import { auth } from "../api/services/auth";

export const serverAuth = createServerFn({ method: "GET" }).handler(
	async () => {
		const request = getWebRequest();
		const session = await auth.api.getSession({
			headers: request.headers,
		});
		return { session };
	},
);

// export async function getSession() {
// 	const request = getWebRequest();
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
