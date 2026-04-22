import type { RequestLogger } from "evlog";
import { useRequest } from "nitro/context";

export function getRequestLogger() {
	try {
		return useRequest().context?.log as RequestLogger | undefined;
	} catch {
		return undefined;
	}
}
