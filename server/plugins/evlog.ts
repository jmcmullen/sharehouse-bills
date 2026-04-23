import {
	createGeoEnricher,
	createRequestSizeEnricher,
	createTraceContextEnricher,
	createUserAgentEnricher,
} from "evlog/enrichers";
import { definePlugin } from "nitro";

const enrichWithGeo = createGeoEnricher();
const enrichWithRequestSize = createRequestSizeEnricher();
const enrichWithTraceContext = createTraceContextEnricher();
const enrichWithUserAgent = createUserAgentEnricher();

function getDeploymentRegion(input: {
	headers?: Record<string, string>;
}): string | null {
	const vercelRegion = process.env.VERCEL_REGION?.trim();
	if (vercelRegion) {
		return vercelRegion;
	}

	const vercelId = input.headers?.["x-vercel-id"];
	if (!vercelId) {
		return null;
	}

	const region = vercelId.split("::")[0]?.trim().toLowerCase();
	return region ? region : null;
}

function shouldKeepWideEvent(input: {
	path?: string;
	status?: number;
	duration?: number;
}) {
	if (typeof input.status === "number" && input.status >= 400) {
		return true;
	}

	if (typeof input.duration === "number" && input.duration >= 1000) {
		return true;
	}

	return (
		input.path === "/api/hooks/up" ||
		input.path === "/api/hooks/whatsapp" ||
		input.path === "/api/hooks/email" ||
		input.path?.startsWith("/api/cron/") === true
	);
}

export default definePlugin((nitroApp) => {
	nitroApp.hooks.hook("evlog:enrich", (ctx) => {
		enrichWithGeo(ctx);
		enrichWithRequestSize(ctx);
		enrichWithTraceContext(ctx);
		enrichWithUserAgent(ctx);

		const region = getDeploymentRegion({
			headers: ctx.headers,
		});
		if (region) {
			ctx.event.deployment = {
				...((typeof ctx.event.deployment === "object" &&
				ctx.event.deployment !== null &&
				!Array.isArray(ctx.event.deployment)
					? ctx.event.deployment
					: {}) as Record<string, unknown>),
				region,
			};
		}
	});

	nitroApp.hooks.hook("evlog:emit:keep", (ctx) => {
		if (
			shouldKeepWideEvent({
				path: ctx.path,
				status: ctx.status,
				duration: ctx.duration,
			})
		) {
			ctx.shouldKeep = true;
		}
	});
});
