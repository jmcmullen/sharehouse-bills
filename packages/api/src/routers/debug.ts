import { z } from "zod";
import { protectedProcedure } from "../lib/orpc";
import {
	type WebhookStatsResponse,
	WebhookStatsService,
} from "../services/webhook-stats";

export const debugRouter = {
	// Get SendGrid webhook statistics
	getWebhookStats: protectedProcedure
		.input(
			z.object({
				days: z.number().min(1).max(365).optional().default(30),
				startDate: z.string().optional(),
				endDate: z.string().optional(),
				aggregatedBy: z
					.enum(["day", "week", "month"])
					.optional()
					.default("day"),
			}),
		)
		.handler(async ({ input }) => {
			try {
				// Apply defaults
				const days = input.days ?? 30;
				const aggregatedBy = input.aggregatedBy ?? "day";

				const webhookStatsService = new WebhookStatsService();

				let stats: WebhookStatsResponse;
				if (input.startDate) {
					// Use custom date range
					stats = await webhookStatsService.getInboundParseStats({
						startDate: input.startDate,
						endDate: input.endDate || undefined,
						aggregatedBy: aggregatedBy,
						limit: 500,
					});
				} else {
					// Use recent stats
					stats = await webhookStatsService.getRecentStats(days);
				}

				// Transform the data for easier frontend consumption
				const transformedStats = (stats.stats || []).map((stat) => ({
					date: stat.date,
					received: (stat.stats || []).reduce(
						(total, s) => total + s.metrics.received,
						0,
					),
				}));

				// Calculate totals
				const totalReceived = transformedStats.reduce(
					(total, stat) => total + stat.received,
					0,
				);

				const result = {
					stats: transformedStats,
					summary: {
						totalReceived,
						dateRange: {
							start: transformedStats[0]?.date || null,
							end: transformedStats[transformedStats.length - 1]?.date || null,
						},
						averagePerDay:
							transformedStats.length > 0
								? Math.round(totalReceived / transformedStats.length)
								: 0,
					},
				};

				return result;
			} catch (error) {
				console.error("Debug ORPC: Error fetching webhook stats:", error);
				throw error;
			}
		}),
};
