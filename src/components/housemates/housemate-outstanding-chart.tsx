"use client";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import type { HousemateBalanceMetric } from "./types";
import { formatCurrency } from "./utils";

interface HousemateOutstandingChartProps {
	balances: HousemateBalanceMetric[];
	title: string;
	metricLabel: string;
	description: string;
	emptyDescription: string;
	summary: string;
	emptySummary: string;
	footerNote: string;
	color: string;
}

export function HousemateOutstandingChart({
	balances,
	title,
	metricLabel,
	description,
	emptyDescription,
	summary,
	emptySummary,
	footerNote,
	color,
}: HousemateOutstandingChartProps) {
	const chartConfig = {
		amount: {
			label: metricLabel,
			color,
		},
	} satisfies ChartConfig;
	const chartData = balances.map((balance) => ({
		name: balance.name,
		shortName: formatHousemateLabel(balance.name),
		amount: balance.amount,
	}));
	const totalAmount = balances.reduce(
		(sum, balance) => sum + balance.amount,
		0,
	);
	const housematesWithBalance = balances.filter(
		(balance) => balance.amount > 0,
	).length;

	return (
		<Card>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<CardDescription>
					{totalAmount > 0 ? description : emptyDescription}
				</CardDescription>
			</CardHeader>
			<CardContent className="pb-0">
				{chartData.length === 0 ? (
					<div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-muted-foreground text-sm">
						Add a housemate to see outstanding balances here
					</div>
				) : (
					<ChartContainer
						config={chartConfig}
						className="aspect-auto h-[280px] w-full"
					>
						<BarChart
							accessibilityLayer
							data={chartData}
							margin={{
								left: 12,
								right: 96,
								top: 16,
							}}
						>
							<CartesianGrid vertical={false} />
							<XAxis
								dataKey="shortName"
								tickLine={false}
								tickMargin={10}
								axisLine={false}
								tickFormatter={(value) => String(value).slice(0, 8)}
							/>
							<ChartTooltip
								cursor={false}
								content={
									<ChartTooltipContent
										hideLabel
										formatter={(value, _, item) => {
											return (
												<div className="flex min-w-[12rem] items-center justify-between gap-3">
													<span className="text-muted-foreground">
														{item.payload.name}
													</span>
													<span className="font-medium font-mono text-foreground tabular-nums">
														{formatCurrency(Number(value))}
													</span>
												</div>
											);
										}}
									/>
								}
							/>
							<Bar dataKey="amount" fill="var(--color-amount)" radius={8} />
						</BarChart>
					</ChartContainer>
				)}
			</CardContent>
			<CardFooter className="flex-col items-start gap-2 text-sm">
				<div className="font-medium leading-none">
					{housematesWithBalance > 0 ? summary : emptySummary}
				</div>
				<div className="text-muted-foreground leading-none">{footerNote}</div>
			</CardFooter>
		</Card>
	);
}

function formatHousemateLabel(name: string) {
	const firstName = name.trim().split(/\s+/)[0] ?? name;
	return firstName.slice(0, 8);
}
