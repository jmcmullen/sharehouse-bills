import { Badge } from "@/components/ui/badge";
import { IconAlertCircle, IconCheck, IconClock } from "@tabler/icons-react";

interface StatusBadgeProps {
	status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
	switch (status) {
		case "paid":
			return (
				<Badge
					variant="default"
					className="border border-green-200 bg-green-100 text-green-800 dark:border-green-600 dark:bg-green-900 dark:text-green-200"
				>
					<IconCheck className="mr-1 h-3 w-3" />
					Paid
				</Badge>
			);
		case "partially_paid":
			return (
				<Badge
					variant="secondary"
					className="border border-yellow-200 bg-yellow-100 text-yellow-800 dark:border-yellow-600 dark:bg-yellow-900 dark:text-yellow-200"
				>
					<IconClock className="mr-1 h-3 w-3" />
					Partially Paid
				</Badge>
			);
		default:
			return (
				<Badge
					variant="outline"
					className="border-red-200 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-300"
				>
					<IconAlertCircle className="mr-1 h-3 w-3" />
					Pending
				</Badge>
			);
	}
}
