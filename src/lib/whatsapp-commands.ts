export type InboundCommandType =
	| "due"
	| "new"
	| "paid"
	| "billpaid"
	| "reminder"
	| "init"
	| "paylinks"
	| "pay"
	| "not_allowed";

export type ParsedInboundCommand = {
	commandType: InboundCommandType;
	requestedFirstName: string | null;
};

function normalizeFirstNameArgument(value: string) {
	const normalizedValue = value.trim().replace(/\s+/g, " ");
	return normalizedValue.length > 0
		? (normalizedValue.split(" ")[0] ?? null)
		: null;
}

function tokenizeCommandBody(body: string) {
	const normalizedBody = body.trim();
	if (!normalizedBody) {
		return null;
	}

	const trimmedLeadingSlash = normalizedBody.replace(/^\/+/, "");
	const [commandTokenRaw, ...argumentParts] = trimmedLeadingSlash.split(/\s+/);
	const commandToken = commandTokenRaw?.toLowerCase() ?? "";
	if (!commandToken) {
		return null;
	}

	return {
		normalizedBody,
		commandToken,
		argumentText: argumentParts.join(" ").trim(),
	};
}

export function parseInboundWhatsappCommand(input: {
	body: string;
	dueKeyword: string;
}) {
	const parsedBody = tokenizeCommandBody(input.body);
	if (!parsedBody) {
		return null;
	}

	const normalizedDueKeyword = input.dueKeyword.trim().toLowerCase();
	if (parsedBody.commandToken === normalizedDueKeyword) {
		return {
			commandType: "due",
			requestedFirstName: parsedBody.argumentText
				? normalizeFirstNameArgument(parsedBody.argumentText)
				: null,
		} satisfies ParsedInboundCommand;
	}

	if (
		parsedBody.commandToken === "new" ||
		parsedBody.commandToken === "paid" ||
		parsedBody.commandToken === "billpaid" ||
		parsedBody.commandToken === "reminder" ||
		parsedBody.commandToken === "init" ||
		parsedBody.commandToken === "paylinks"
	) {
		return {
			commandType: parsedBody.commandToken,
			requestedFirstName: null,
		} satisfies ParsedInboundCommand;
	}

	return null;
}

export function parseStoredInboundCommandType(
	commandType: unknown,
): InboundCommandType {
	if (commandType === "new") {
		return "new";
	}

	if (commandType === "paid") {
		return "paid";
	}

	if (commandType === "billpaid") {
		return "billpaid";
	}

	if (commandType === "reminder") {
		return "reminder";
	}

	if (commandType === "init") {
		return "init";
	}

	if (commandType === "paylinks") {
		return "paylinks";
	}

	if (commandType === "pay") {
		return "pay";
	}

	if (commandType === "not_allowed") {
		return "not_allowed";
	}

	if (commandType === "help") {
		return "pay";
	}

	return "due";
}

export function commandNeedsHousemateTarget(commandType: InboundCommandType) {
	return commandType === "due" || commandType === "pay";
}
