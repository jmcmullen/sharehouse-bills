import type { RequestLogger } from "evlog";

function getQueryKeys(url: URL) {
	return Array.from(url.searchParams.keys()).sort();
}

export function setApiRequestContext(
	log: RequestLogger | undefined,
	request: Request,
	context?: Record<string, unknown>,
) {
	const url = new URL(request.url);
	const queryKeys = getQueryKeys(url);
	const requestContext: Record<string, unknown> = {};

	const contentType = request.headers.get("content-type");
	if (contentType) {
		requestContext.contentType = contentType;
	}

	const contentLength = request.headers.get("content-length");
	if (contentLength) {
		requestContext.contentLength = contentLength;
	}

	if (queryKeys.length > 0) {
		requestContext.queryKeys = queryKeys;
	}

	log?.set({
		...(Object.keys(requestContext).length > 0
			? { request: requestContext }
			: {}),
		...context,
	});
}

export function setApiResponseContext(
	log: RequestLogger | undefined,
	response: {
		contentType?: string | null;
		streamed?: boolean;
	},
	context?: Record<string, unknown>,
) {
	const responseContext: Record<string, unknown> = {};

	if (response.contentType) {
		responseContext.contentType = response.contentType;
	}

	if (response.streamed) {
		responseContext.streamed = true;
	}

	log?.set({
		...(Object.keys(responseContext).length > 0
			? { response: responseContext }
			: {}),
		...context,
	});
}
