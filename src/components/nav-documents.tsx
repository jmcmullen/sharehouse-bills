import type { Icon } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";

import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";

export function NavDocuments({
	items,
	title = "Tools",
}: {
	items: {
		name?: string;
		title?: string;
		url: string;
		icon: Icon;
	}[];
	title?: string;
}) {
	return (
		<SidebarGroup className="group-data-[collapsible=icon]:hidden">
			<SidebarGroupLabel>{title}</SidebarGroupLabel>
			<SidebarMenu>
				{items.map((item) => (
					<SidebarMenuItem key={item.name || item.title}>
						<SidebarMenuButton asChild>
							<Link to={item.url}>
								<item.icon />
								<span>{item.name || item.title}</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				))}
			</SidebarMenu>
		</SidebarGroup>
	);
}
