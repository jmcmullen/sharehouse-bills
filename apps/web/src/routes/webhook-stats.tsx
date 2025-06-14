import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { client } from "@/utils/orpc";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/webhook-stats")({
	component: RouteComponent,
});

interface WebhookStatsQuery {
	days?: number;
	startDate?: string;
	endDate?: string;
	aggregatedBy?: "day" | "week" | "month";
}

interface WebhookStatsData {
	stats: Array<{
		date: string;
		received: number;
	}>;
	summary: {
		totalReceived: number;
		dateRange: {
			start: string | null;
			end: string | null;
		};
		averagePerDay: number;
	};
}

function RouteComponent() {
	const navigate = Route.useNavigate();
	const { data: session, isPending } = authClient.useSession();

	const [dateRange, setDateRange] = useState({
		days: 30,
		startDate: "",
		endDate: "",
	});

	const [queryInput, setQueryInput] = useState<WebhookStatsQuery>({ days: 30 });

	useEffect(() => {
		if (!session && !isPending) {
			navigate({
				to: "/login",
			});
		}
	}, [session, isPending, navigate]);

	const webhookStats = useQuery<WebhookStatsData>({
		queryKey: ["webhook-stats", queryInput],
		queryFn: async () => {
			return await client.debug.getWebhookStats(queryInput);
		},
		enabled: !!session, // Only run when user is authenticated
	});

	const handleQuickPeriod = (days: number) => {
		setDateRange({ days, startDate: "", endDate: "" });
		setQueryInput({ days });
	};

	const handleCustomDateRange = () => {
		if (dateRange.startDate) {
			setQueryInput({
				startDate: dateRange.startDate,
				endDate: dateRange.endDate || undefined,
				aggregatedBy: "day",
			});
		}
	};

	if (isPending) {
		return <div>Loading...</div>;
	}

	if (!session) {
		return null;
	}

	return (
		<div className="container mx-auto px-4 py-8">
			<h1 className="mb-6 font-bold text-3xl">SendGrid Webhook Statistics</h1>
			<p className="mb-6 text-gray-600">
				Monitor your inbound parse webhook performance and email processing
				metrics.
			</p>

			{/* Date Range Controls */}
			<Card className="mb-6 p-6">
				<h2 className="mb-4 font-semibold text-xl">Date Range</h2>
				<div className="space-y-4">
					{/* Quick Periods */}
					<div>
						<Label className="mb-2 block">Quick Periods</Label>
						<div className="flex flex-wrap gap-2">
							{[7, 14, 30, 60, 90].map((days) => (
								<Button
									key={days}
									variant={
										dateRange.days === days && !dateRange.startDate
											? "default"
											: "outline"
									}
									size="sm"
									onClick={() => handleQuickPeriod(days)}
								>
									Last {days} days
								</Button>
							))}
						</div>
					</div>

					{/* Custom Date Range */}
					<div>
						<Label className="mb-2 block">Custom Date Range</Label>
						<div className="flex flex-wrap items-end gap-4">
							<div>
								<Label htmlFor="start-date" className="text-sm">
									Start Date
								</Label>
								<Input
									id="start-date"
									type="date"
									value={dateRange.startDate}
									onChange={(e) =>
										setDateRange({ ...dateRange, startDate: e.target.value })
									}
									className="w-40"
								/>
							</div>
							<div>
								<Label htmlFor="end-date" className="text-sm">
									End Date
								</Label>
								<Input
									id="end-date"
									type="date"
									value={dateRange.endDate}
									onChange={(e) =>
										setDateRange({ ...dateRange, endDate: e.target.value })
									}
									className="w-40"
								/>
							</div>
							<Button
								onClick={handleCustomDateRange}
								disabled={!dateRange.startDate}
							>
								Apply
							</Button>
						</div>
					</div>
				</div>
			</Card>

			{/* Statistics */}
			{webhookStats.isLoading && (
				<Card className="p-6">
					<div className="animate-pulse">
						<div className="mb-4 h-4 w-1/4 rounded bg-gray-200" />
						<div className="space-y-2">
							<div className="h-3 w-full rounded bg-gray-200" />
							<div className="h-3 w-5/6 rounded bg-gray-200" />
							<div className="h-3 w-4/6 rounded bg-gray-200" />
						</div>
					</div>
				</Card>
			)}

			{webhookStats.error && (
				<Card className="border-red-200 bg-red-50 p-6">
					<h3 className="font-medium text-red-800">Error Loading Stats</h3>
					<p className="mt-1 text-red-600 text-sm">
						{webhookStats.error instanceof Error
							? webhookStats.error.message
							: "Unknown error occurred"}
					</p>
				</Card>
			)}

			{webhookStats.data && (
				<div className="space-y-6">
					{/* Summary Cards */}
					<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
						<Card className="p-6">
							<h3 className="font-medium text-gray-600 text-sm">
								Total Emails Received
							</h3>
							<p className="font-bold text-3xl text-blue-600">
								{webhookStats.data.summary.totalReceived.toLocaleString()}
							</p>
						</Card>
						<Card className="p-6">
							<h3 className="font-medium text-gray-600 text-sm">
								Average Per Day
							</h3>
							<p className="font-bold text-3xl text-green-600">
								{webhookStats.data.summary.averagePerDay.toLocaleString()}
							</p>
						</Card>
						<Card className="p-6">
							<h3 className="font-medium text-gray-600 text-sm">Date Range</h3>
							<p className="font-medium text-sm">
								{webhookStats.data.summary.dateRange.start &&
								webhookStats.data.summary.dateRange.end
									? `${new Date(webhookStats.data.summary.dateRange.start).toLocaleDateString()} - ${new Date(webhookStats.data.summary.dateRange.end).toLocaleDateString()}`
									: "No data"}
							</p>
						</Card>
					</div>

					{/* Daily Stats Table */}
					<Card className="p-6">
						<h3 className="mb-4 font-semibold text-xl">Daily Statistics</h3>
						{webhookStats.data.stats.length > 0 ? (
							<div className="overflow-x-auto">
								<table className="min-w-full divide-y divide-gray-200">
									<thead className="bg-gray-50">
										<tr>
											<th className="px-6 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">
												Date
											</th>
											<th className="px-6 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">
												Emails Received
											</th>
											<th className="px-6 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">
												Bar Chart
											</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-gray-200 bg-white">
										{webhookStats.data.stats
											.sort(
												(a, b) =>
													new Date(b.date).getTime() -
													new Date(a.date).getTime(),
											)
											.map((stat) => {
												const maxReceived = Math.max(
													...webhookStats.data.stats.map((s) => s.received),
												);
												const barWidth =
													maxReceived > 0
														? (stat.received / maxReceived) * 100
														: 0;

												return (
													<tr key={stat.date}>
														<td className="whitespace-nowrap px-6 py-4 font-medium text-gray-900 text-sm">
															{new Date(stat.date).toLocaleDateString()}
														</td>
														<td className="whitespace-nowrap px-6 py-4 text-gray-500 text-sm">
															{stat.received.toLocaleString()}
														</td>
														<td className="px-6 py-4">
															<div className="h-4 overflow-hidden rounded-full bg-gray-200">
																<div
																	className="h-full bg-blue-500 transition-all duration-300"
																	style={{ width: `${barWidth}%` }}
																/>
															</div>
														</td>
													</tr>
												);
											})}
									</tbody>
								</table>
							</div>
						) : (
							<p className="py-8 text-center text-gray-500">
								No data available for the selected date range.
							</p>
						)}
					</Card>
				</div>
			)}
		</div>
	);
}
