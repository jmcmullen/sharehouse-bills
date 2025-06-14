import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import {
	IconEdit,
	IconEye,
	IconMail,
	IconTrash,
	IconUser,
} from "@tabler/icons-react";
import { HousemateStatusBadge } from "./housemate-status-badge";
import type { Housemate } from "./types";
import { formatDate } from "./utils";

interface HousemateTableRowProps {
	housemate: Housemate;
	onViewDetails: (housemate: Housemate) => void;
	onEdit: (housemate: Housemate) => void;
	onDeactivate: (housemate: Housemate) => void;
	onReactivate: (housemateId: number) => void;
	isReactivating: boolean;
}

export function HousemateTableRow({
	housemate,
	onViewDetails,
	onEdit,
	onDeactivate,
	onReactivate,
	isReactivating,
}: HousemateTableRowProps) {
	return (
		<TableRow>
			<TableCell className="font-medium">
				<div className="flex items-center gap-2">
					<IconUser className="h-4 w-4 text-muted-foreground" />
					{housemate.name}
				</div>
			</TableCell>
			<TableCell>
				<div className="flex items-center gap-2">
					{housemate.email ? (
						<>
							<IconMail className="h-4 w-4 text-muted-foreground" />
							{housemate.email}
						</>
					) : (
						<span className="text-muted-foreground">No email</span>
					)}
				</div>
			</TableCell>
			<TableCell>
				{housemate.bankAlias ? (
					housemate.bankAlias
				) : (
					<span className="text-muted-foreground">Not set</span>
				)}
			</TableCell>
			<TableCell>
				<HousemateStatusBadge housemate={housemate} />
			</TableCell>
			<TableCell>{formatDate(housemate.createdAt)}</TableCell>
			<TableCell className="text-right">
				<div className="flex items-center justify-end gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => onViewDetails(housemate)}
					>
						<IconEye className="h-4 w-4" />
					</Button>
					<Button variant="outline" size="sm" onClick={() => onEdit(housemate)}>
						<IconEdit className="h-4 w-4" />
					</Button>
					{housemate.isActive ? (
						<Button
							variant="destructive"
							size="sm"
							onClick={() => onDeactivate(housemate)}
							disabled={housemate.isOwner}
						>
							<IconTrash className="h-4 w-4" />
						</Button>
					) : (
						<Button
							variant="outline"
							size="sm"
							className="border-green-200 text-green-600 hover:bg-green-50"
							onClick={() => onReactivate(housemate.id)}
							disabled={isReactivating}
						>
							Reactivate
						</Button>
					)}
				</div>
			</TableCell>
		</TableRow>
	);
}
