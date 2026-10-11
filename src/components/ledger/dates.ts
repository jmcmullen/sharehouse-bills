export const ledgerDate = (seconds: number): string =>
	new Intl.DateTimeFormat("en-AU", {
		timeZone: "Australia/Sydney",
		day: "numeric",
		month: "short",
		year: "numeric",
	}).format(new Date(seconds * 1000));
export const ledgerTime = (seconds: number): string =>
	new Intl.DateTimeFormat("en-AU", {
		timeZone: "Australia/Sydney",
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		timeZoneName: "short",
	}).format(new Date(seconds * 1000));
