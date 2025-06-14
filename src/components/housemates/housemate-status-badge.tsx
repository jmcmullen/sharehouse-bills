import { Badge } from "@/components/ui/badge";
import { IconCheck, IconCrown, IconX } from "@tabler/icons-react";
import type { Housemate } from "./types";

interface HousemateStatusBadgeProps {
	housemate: Housemate;
}

export function HousemateStatusBadge({ housemate }: HousemateStatusBadgeProps) {
	if (housemate.isOwner) {
		return (
			<Badge
				variant="default"
				className="border-purple-200 bg-purple-100 text-purple-800"
			>
				<IconCrown className="mr-1 h-3 w-3" />
				Owner
			</Badge>
		);
	}

	if (housemate.isActive) {
		return (
			<Badge
				variant="default"
				className="border-green-200 bg-green-100 text-green-800"
			>
				<IconCheck className="mr-1 h-3 w-3" />
				Active
			</Badge>
		);
	}

	return (
		<Badge
			variant="outline"
			className="border-gray-200 bg-gray-100 text-gray-800"
		>
			<IconX className="mr-1 h-3 w-3" />
			Inactive
		</Badge>
	);
}
