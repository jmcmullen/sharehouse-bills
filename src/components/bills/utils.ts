export function formatDate(seconds: number): string {
	return new Date(seconds * 1000).toLocaleDateString("en-AU", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

export const PAGINATION_CONFIG = {
	itemsPerPage: 10,
} as const;
