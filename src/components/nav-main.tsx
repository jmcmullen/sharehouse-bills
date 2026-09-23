import type { Icon } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";

import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/components/ui/sidebar";

export function NavMain({
	items,
	title = "Main",
}: {
	items: {
		title: string;
		url: string;
		icon?: Icon;
	}[];
	title?: string;
}) {
	const { setOpenMobile } = useSidebar();

	return (
		<SidebarGroup>
			<SidebarGroupLabel>{title}</SidebarGroupLabel>
			<SidebarGroupContent>
				<SidebarMenu>
					{items.map((item) => (
						<SidebarMenuItem key={item.title}>
							<SidebarMenuButton tooltip={item.title} asChild>
								<Link to={item.url} onClick={() => setOpenMobile(false)}>
									{item.icon && <item.icon />}
									<span>{item.title}</span>
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
					))}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}
