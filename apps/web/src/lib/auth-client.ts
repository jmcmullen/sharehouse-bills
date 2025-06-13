import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	baseURL:
		typeof window !== "undefined"
			? `${window.location.protocol}//${window.location.host}/api/auth`
			: "http://localhost:3001/api/auth",
});
