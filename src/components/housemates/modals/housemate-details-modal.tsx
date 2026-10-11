import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { formatCents } from "@/lib/money";
import {
	IconChartPie,
	IconCheck,
	IconCurrencyDollar,
	IconUser,
	IconX,
} from "@tabler/icons-react";
import type { Housemate, HousemateAccount } from "../types";
import { formatDate } from "../utils";

function formatDay(seconds: number) {
	return formatDate(new Date(seconds * 1000));
}

interface HousemateDetailsModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	housemate: Housemate | null;
	account: HousemateAccount | null;
	isLoading: boolean;
}

export function HousemateDetailsModal({
	open,
	onOpenChange,
	housemate,
	account,
	isLoading,
}: HousemateDetailsModalProps) {
	const shares = account?.shares ?? [];
	const renderStatsCards = () => (
		<div className="grid gap-4 md:grid-cols-3">
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="font-medium text-sm">Owes</CardTitle>
					<IconCurrencyDollar className="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div className="font-bold text-2xl">
						{isLoading ? (
							<Skeleton className="h-8 w-20" />
						) : (
							formatCents(account?.owesCents ?? 0)
						)}
					</div>
				</CardContent>
			</Card>
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="font-medium text-sm">Credit held</CardTitle>
					<IconCheck className="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div className="font-bold text-2xl">
						{isLoading ? (
							<Skeleton className="h-8 w-20" />
						) : (
							formatCents(account?.creditCents ?? 0)
						)}
					</div>
				</CardContent>
			</Card>
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="font-medium text-sm">Unpaid shares</CardTitle>
					<IconChartPie className="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div className="font-bold text-2xl">
						{isLoading ? (
							<Skeleton className="h-8 w-20" />
						) : (
							formatCents(account?.remainingCents ?? 0)
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);

	const renderPaymentHistory = () => (
		<Card>
			<CardHeader>
				<CardTitle>Payment History</CardTitle>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<div className="space-y-3">
						{Array.from({ length: 3 }, () => (
							<Skeleton key={crypto.randomUUID()} className="h-12 w-full" />
						))}
					</div>
				) : shares.length === 0 ? (
					<div className="py-8 text-center">
						<p className="text-muted-foreground">No payment history found</p>
					</div>
				) : (
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Bill</TableHead>
									<TableHead>Amount</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Due Date</TableHead>
									<TableHead>Paid Date</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{shares.map((share) => (
									<TableRow key={share.id}>
										<TableCell className="font-medium">{share.name}</TableCell>
										<TableCell className="font-mono">
											{formatCents(
												share.remainingCents > 0
													? share.remainingCents
													: share.paidCents,
											)}
										</TableCell>
										<TableCell>
											{share.remainingCents === 0 ? (
												<Badge className="bg-green-100 text-green-800">
													<IconCheck className="mr-1 h-3 w-3" />
													Paid
												</Badge>
											) : (
												<Badge
													variant="outline"
													className="bg-red-50 text-red-800"
												>
													<IconX className="mr-1 h-3 w-3" />
													Unpaid
												</Badge>
											)}
										</TableCell>
										<TableCell>{formatDay(share.dueAt)}</TableCell>
										<TableCell>
											{share.settledAt === null
												? "-"
												: formatDay(share.settledAt)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}
			</CardContent>
		</Card>
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="!max-w-4xl !w-[70vw] sm:!max-w-4xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<IconUser className="h-5 w-5" />
						{housemate?.name} - Payment Details
					</DialogTitle>
					<DialogDescription>
						Complete payment history and statistics
					</DialogDescription>
				</DialogHeader>

				{housemate && (
					<div className="space-y-6">
						{renderStatsCards()}
						{renderPaymentHistory()}
					</div>
				)}

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Close
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
