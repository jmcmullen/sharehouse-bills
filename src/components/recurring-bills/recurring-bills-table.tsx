import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	IconBolt,
	IconPencil,
	IconPlayerPause,
	IconPlayerPlay,
	IconPlus,
	IconRepeat,
	IconTrash,
} from "@tabler/icons-react";
import type { RecurringBillListItem } from "./types";
import { formatCurrency, formatDate, getScheduleSummary } from "./utils";

interface RecurringBillsTableProps {
	items: RecurringBillListItem[];
	onAdd: () => void;
	onEdit: (item: RecurringBillListItem) => void;
	onToggleActive: (item: RecurringBillListItem) => void;
	onGenerateNow: (item: RecurringBillListItem) => void;
	onDelete: (item: RecurringBillListItem) => void;
	isPending: boolean;
}

export function RecurringBillsTable({
	items,
	onAdd,
	onEdit,
	onToggleActive,
	onGenerateNow,
	onDelete,
	isPending,
}: RecurringBillsTableProps) {
	if (items.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Recurring Bills</CardTitle>
				</CardHeader>
				<CardContent className="py-10 text-center">
					<IconRepeat className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
					<h3 className="mb-2 font-semibold text-lg">No recurring bills yet</h3>
					<p className="mb-4 text-muted-foreground">
						Create a recurring bill template for rent, subscriptions, or other
						regular charges.
					</p>
					<Button onClick={onAdd}>
						<IconPlus className="mr-2 h-4 w-4" />
						Add Recurring Bill
					</Button>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Recurring Bills</CardTitle>
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Template</TableHead>
							<TableHead>Schedule</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Total</TableHead>
							<TableHead>Split</TableHead>
							<TableHead>Next Due</TableHead>
							<TableHead>Participants</TableHead>
							<TableHead>Generated</TableHead>
							<TableHead className="text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{items.map((item) => (
							<TableRow key={item.template.id}>
								<TableCell>
									<div className="space-y-1">
										<div className="font-medium">
											{item.template.templateName}
										</div>
										<div className="text-muted-foreground text-sm">
											{item.template.billerName}
										</div>
									</div>
								</TableCell>
								<TableCell>{getScheduleSummary(item)}</TableCell>
								<TableCell>
									<Badge
										variant={item.template.isActive ? "default" : "secondary"}
									>
										{item.template.isActive ? "Active" : "Paused"}
									</Badge>
								</TableCell>
								<TableCell className="font-mono">
									{formatCurrency(item.template.totalAmount)}
								</TableCell>
								<TableCell>
									{item.template.splitStrategy === "equal" ? "Equal" : "Custom"}
								</TableCell>
								<TableCell>{formatDate(item.nextDueDate)}</TableCell>
								<TableCell>{item.preview.assignments.length}</TableCell>
								<TableCell>{item.generatedCount}</TableCell>
								<TableCell className="text-right">
									<div className="flex items-center justify-end gap-2">
										<Button
											variant="outline"
											size="sm"
											onClick={() => onEdit(item)}
										>
											<IconPencil className="h-4 w-4" />
											Edit
										</Button>
										<Button
											variant="outline"
											size="sm"
											onClick={() => onGenerateNow(item)}
											disabled={isPending}
										>
											<IconBolt className="h-4 w-4" />
											Generate Now
										</Button>
										<Button
											variant="outline"
											size="sm"
											onClick={() => onToggleActive(item)}
											disabled={isPending}
										>
											{item.template.isActive ? (
												<>
													<IconPlayerPause className="h-4 w-4" />
													Pause
												</>
											) : (
												<>
													<IconPlayerPlay className="h-4 w-4" />
													Resume
												</>
											)}
										</Button>
										<Button
											variant="destructive"
											size="sm"
											onClick={() => onDelete(item)}
											disabled={isPending}
										>
											<IconTrash className="h-4 w-4" />
											Delete
										</Button>
									</div>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}
