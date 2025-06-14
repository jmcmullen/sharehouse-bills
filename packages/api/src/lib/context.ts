import { auth } from "./auth";

export type CreateContextOptions = {
	req?: Request;
};

export async function createContext({ req }: CreateContextOptions) {
	const headers = req?.headers;

	if (!headers) {
		throw new Error("Request must be provided");
	}

	const session = await auth.api.getSession({
		headers,
	});

	return {
		session,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
