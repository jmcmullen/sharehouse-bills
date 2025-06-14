import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { IconPlus, IconUsers } from "@tabler/icons-react";
import { HousemateTableRow } from "./housemate-table-row";
import type { Housemate } from "./types";

interface HousematesTableProps {
	housemates: Housemate[];
	isLoading: boolean;
	onAddHousemate: () => void;
	onViewDetails: (housemate: Housemate) => void;
	onEdit: (housemate: Housemate) => void;
	onDeactivate: (housemate: Housemate) => void;
	onReactivate: (housemateId: number) => void;
	isReactivating: boolean;
}

export function HousematesTable({
	housemates,
	isLoading,
	onAddHousemate,
	onViewDetails,
	onEdit,
	onDeactivate,
	onReactivate,
	isReactivating,
}: HousematesTableProps) {
	const renderLoadingSkeleton = () => (
		<div className="space-y-3">
			{Array.from({ length: 3 }, () => (
				<Skeleton key={crypto.randomUUID()} className="h-12 w-full" />
			))}
		</div>
	);

	const renderEmptyState = () => (
		<div className="py-8 text-center">
			<IconUsers className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
			<h3 className="mb-2 font-semibold text-lg">No housemates found</h3>
			<p className="mb-4 text-muted-foreground">
				Get started by adding your first housemate
			</p>
			<Button onClick={onAddHousemate}>
				<IconPlus className="mr-2 h-4 w-4" />
				Add Your First Housemate
			</Button>
		</div>
	);

	const renderTable = () => (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Name</TableHead>
					<TableHead>Email</TableHead>
					<TableHead>Bank Alias</TableHead>
					<TableHead>Status</TableHead>
					<TableHead>Joined</TableHead>
					<TableHead className="text-right">Actions</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{housemates.map((housemate) => (
					<HousemateTableRow
						key={housemate.id}
						housemate={housemate}
						onViewDetails={onViewDetails}
						onEdit={onEdit}
						onDeactivate={onDeactivate}
						onReactivate={onReactivate}
						isReactivating={isReactivating}
					/>
				))}
			</TableBody>
		</Table>
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<IconUsers className="h-5 w-5" />
					All Housemates
				</CardTitle>
			</CardHeader>
			<CardContent>
				{isLoading
					? renderLoadingSkeleton()
					: housemates.length === 0
						? renderEmptyState()
						: renderTable()}
			</CardContent>
		</Card>
	);
}
