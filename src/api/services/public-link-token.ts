import { createHmac, timingSafeEqual } from "node:crypto";

function getPublicLinkSecret() {
	return (
		process.env.REMINDER_LINK_SECRET?.trim() ||
		process.env.CRON_SECRET?.trim() ||
		process.env.BETTER_AUTH_SECRET?.trim() ||
		null
	);
}

export function signPublicLinkPayload(payload: string) {
	const secret = getPublicLinkSecret();
	if (!secret) {
		return null;
	}

	return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSignedPublicLinkToken(parts: string[], payload: string) {
	const signature = signPublicLinkPayload(payload);
	if (!signature) {
		return null;
	}

	return [...parts, signature].join(".");
}

export function publicLinkSignaturesMatch(
	providedSignature: string,
	expectedSignature: string,
) {
	const providedBuffer = Buffer.from(providedSignature, "utf8");
	const expectedBuffer = Buffer.from(expectedSignature, "utf8");

	return (
		providedBuffer.length === expectedBuffer.length &&
		timingSafeEqual(providedBuffer, expectedBuffer)
	);
}
