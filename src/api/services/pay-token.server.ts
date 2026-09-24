import { BillPdfStorageService } from "./bill-pdf-storage";
import {
	createSignedPublicLinkToken,
	publicLinkSignaturesMatch,
	signPublicLinkPayload,
} from "./public-link-token";

type PayTokenInput = {
	housemateId: string;
	stackGroup?: string | null;
	billIds?: string[] | null;
};

export type PayScope =
	| {
			kind: "all";
			stackGroup: null;
			billIds: null;
	  }
	| {
			kind: "stack";
			stackGroup: string;
			billIds: null;
	  }
	| {
			kind: "bills";
			stackGroup: null;
			billIds: string[];
	  };

function encodeStackGroup(stackGroup: string) {
	return Buffer.from(stackGroup, "utf8").toString("base64url");
}

function decodeStackGroup(encodedStackGroup: string) {
	return Buffer.from(encodedStackGroup, "base64url").toString("utf8").trim();
}

function normalizeBillIds(billIds: string[] | null | undefined) {
	if (!billIds) {
		return [];
	}

	return [
		...new Set(billIds.map((billId) => billId.trim()).filter(Boolean)),
	].sort((left, right) => left.localeCompare(right));
}

function encodeBillIds(billIds: string[]) {
	return Buffer.from(JSON.stringify(billIds), "utf8").toString("base64url");
}

function decodeBillIds(encodedBillIds: string) {
	try {
		const parsed = JSON.parse(
			Buffer.from(encodedBillIds, "base64url").toString("utf8"),
		);
		return Array.isArray(parsed)
			? normalizeBillIds(parsed.filter((value) => typeof value === "string"))
			: [];
	} catch {
		return [];
	}
}

export function createPayToken(input: PayTokenInput) {
	const housemateId = input.housemateId.trim();
	const stackGroup = input.stackGroup?.trim() ?? null;
	const billIds = normalizeBillIds(input.billIds);
	if (!housemateId) {
		return null;
	}

	if (billIds.length > 0) {
		const encodedBillIds = encodeBillIds(billIds);
		return createSignedPublicLinkToken(
			["bills", housemateId, encodedBillIds],
			`bills:${housemateId}:${billIds.join(",")}`,
		);
	}

	if (!stackGroup) {
		return createSignedPublicLinkToken(
			["all", housemateId],
			`all:${housemateId}`,
		);
	}

	return createSignedPublicLinkToken(
		["stack", housemateId, encodeStackGroup(stackGroup)],
		`stack:${housemateId}:${stackGroup}`,
	);
}

export function createPayPath(input: PayTokenInput) {
	const token = createPayToken(input);
	if (!token) {
		return null;
	}

	return BillPdfStorageService.getHousematePayUrl(token);
}

export function createAbsolutePayUrl(
	input: PayTokenInput,
	previewDate?: string | null,
) {
	const path = createPayPath(input);
	return path
		? BillPdfStorageService.getAbsoluteAppUrl(
				BillPdfStorageService.appendMessageCacheDate(path, previewDate),
			)
		: null;
}

// Resolves a signed pay link token to its housemate and scope. Every scope
// (all, stack, bills) belongs to exactly one housemate.
export function parsePayToken(
	token: string,
): { housemateId: string; scope: PayScope } | null {
	const parts = token.split(".");

	if (parts[0] === "all" && parts.length === 3) {
		return parseAllPayToken(parts);
	}

	if (parts[0] === "stack" && parts.length === 4) {
		return parseStackPayToken(parts);
	}

	if (parts[0] === "bills" && parts.length === 4) {
		return parseBillsPayToken(parts);
	}

	return null;
}

function isValidPayTokenSignature(signature: string, payload: string) {
	const expectedSignature = signPublicLinkPayload(payload);
	return (
		expectedSignature !== null &&
		publicLinkSignaturesMatch(signature, expectedSignature)
	);
}

function parseAllPayToken(
	parts: string[],
): { housemateId: string; scope: PayScope } | null {
	const [, housemateIdPart, signaturePart] = parts;
	const housemateId = housemateIdPart?.trim() ?? "";
	if (!housemateId || !signaturePart) {
		return null;
	}

	if (!isValidPayTokenSignature(signaturePart, `all:${housemateId}`)) {
		return null;
	}

	return {
		housemateId,
		scope: {
			kind: "all",
			stackGroup: null,
			billIds: null,
		},
	};
}

function parseStackPayToken(
	parts: string[],
): { housemateId: string; scope: PayScope } | null {
	const [, housemateIdPart, encodedStackGroup, signaturePart] = parts;
	const housemateId = housemateIdPart?.trim() ?? "";
	const stackGroup = encodedStackGroup
		? decodeStackGroup(encodedStackGroup)
		: "";
	if (!housemateId || !stackGroup || !signaturePart) {
		return null;
	}

	if (
		!isValidPayTokenSignature(
			signaturePart,
			`stack:${housemateId}:${stackGroup}`,
		)
	) {
		return null;
	}

	return {
		housemateId,
		scope: {
			kind: "stack",
			stackGroup,
			billIds: null,
		},
	};
}

function parseBillsPayToken(
	parts: string[],
): { housemateId: string; scope: PayScope } | null {
	const [, housemateIdPart, encodedBillIds, signaturePart] = parts;
	const housemateId = housemateIdPart?.trim() ?? "";
	const billIds = encodedBillIds ? decodeBillIds(encodedBillIds) : [];
	if (!housemateId || billIds.length === 0 || !signaturePart) {
		return null;
	}

	if (
		!isValidPayTokenSignature(
			signaturePart,
			`bills:${housemateId}:${billIds.join(",")}`,
		)
	) {
		return null;
	}

	return {
		housemateId,
		scope: {
			kind: "bills",
			stackGroup: null,
			billIds,
		},
	};
}
