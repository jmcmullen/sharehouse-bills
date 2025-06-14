import {
	IconChartBar,
	IconFileDescription,
	IconHelp,
	IconInnerShadowTop,
	IconReceipt,
	IconSettings,
	IconTestPipe,
	IconUsers,
	IconWebhook,
} from "@tabler/icons-react";
import type * as React from "react";

import { NavDocuments } from "@/components/nav-documents";
import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import { NavUser } from "@/components/nav-user";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Link, useRouterState } from "@tanstack/react-router";

const data = {
	navMain: [
		{
			title: "Bills",
			url: "/bills",
			icon: IconReceipt,
		},
		{
			title: "Housemates",
			url: "/housemates",
			icon: IconUsers,
		},
	],
	webhookTools: [
		{
			title: "Test Webhook",
			icon: IconTestPipe,
			url: "/hook/test",
			items: [],
		},
		{
			title: "Webhook Stats",
			icon: IconChartBar,
			url: "/hook/stats",
			items: [],
		},
	],
	navSecondary: [
		{
			title: "Settings",
			url: "#",
			icon: IconSettings,
		},
		{
			title: "Help",
			url: "#",
			icon: IconHelp,
		},
	],
	documents: [
		{
			name: "Documentation",
			url: "#",
			icon: IconFileDescription,
		},
		{
			name: "Webhooks",
			url: "/hook/stats",
			icon: IconWebhook,
		},
	],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	const routerState = useRouterState();
	const session = routerState.matches[0]?.context?.session;

	const user = session?.user
		? {
				name: session.user.name || "Unknown User",
				email: session.user.email || "user@example.com",
				avatar: session.user.image || null,
			}
		: {
				name: "Unknown User",
				email: "user@example.com",
				avatar: null,
			};

	return (
		<Sidebar collapsible="offcanvas" {...props}>
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							asChild
							className="data-[slot=sidebar-menu-button]:!p-1.5"
						>
							<Link to="/">
								<IconInnerShadowTop className="!size-5" />
								<span className="font-semibold text-base">
									Sharehouse Bills
								</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<NavMain items={data.navMain} />
				<NavDocuments items={data.webhookTools} title="Developer Tools" />
				<NavDocuments items={data.documents} title="Resources" />
				<NavSecondary items={data.navSecondary} className="mt-auto" />
			</SidebarContent>
			<SidebarFooter>
				<NavUser user={user} />
			</SidebarFooter>
		</Sidebar>
	);
}
