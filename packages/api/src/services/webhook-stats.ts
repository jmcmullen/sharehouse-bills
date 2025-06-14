import client from "@sendgrid/client";

export interface WebhookStatsParams {
	startDate: string; // YYYY-MM-DD format
	endDate?: string; // YYYY-MM-DD format
	limit?: number; // max 500
	offset?: number;
	aggregatedBy?: "day" | "week" | "month";
}

export interface WebhookStatistic {
	date: string;
	stats: Array<{
		metrics: {
			received: number;
		};
	}>;
}

export interface WebhookStatsResponse {
	stats: WebhookStatistic[];
}

export class WebhookStatsService {
	constructor() {
		const apiKey = process.env.SENDGRID_API_KEY;
		if (!apiKey) {
			throw new Error("SENDGRID_API_KEY environment variable is required");
		}

		// Set the API key for the SendGrid client
		client.setApiKey(apiKey);
	}

	async getInboundParseStats(
		params: WebhookStatsParams,
	): Promise<WebhookStatsResponse> {
		const queryParams: Record<string, string> = {
			start_date: params.startDate,
		};

		if (params.endDate) {
			queryParams.end_date = params.endDate;
		}
		if (params.limit) {
			queryParams.limit = params.limit.toString();
		}
		if (params.offset) {
			queryParams.offset = params.offset.toString();
		}
		if (params.aggregatedBy) {
			queryParams.aggregated_by = params.aggregatedBy;
		}

		const request = {
			url: "/v3/user/webhooks/parse/stats",
			method: "GET" as const,
			qs: queryParams,
		};

		try {
			const [response, body] = await client.request(request);

			console.log(
				"SendGrid webhook stats raw response:",
				JSON.stringify(body, null, 2),
			);

			if (response.statusCode >= 400) {
				console.error("WebhookStatsService: SendGrid API error:", {
					status: response.statusCode,
					body: body,
				});
				throw new Error(
					`SendGrid API error: ${response.statusCode} - ${JSON.stringify(body)}`,
				);
			}

			const data = body as WebhookStatsResponse;
			return data;
		} catch (error) {
			console.error(
				"WebhookStatsService: Failed to fetch webhook stats:",
				error,
			);
			throw error;
		}
	}

	async getRecentStats(days = 30): Promise<WebhookStatsResponse> {
		const endDate = new Date();
		const startDate = new Date();
		startDate.setDate(endDate.getDate() - days);

		const params = {
			startDate: startDate.toISOString().split("T")[0],
			endDate: endDate.toISOString().split("T")[0],
			aggregatedBy: "day" as const,
			limit: days,
		};

		return this.getInboundParseStats(params);
	}
}
