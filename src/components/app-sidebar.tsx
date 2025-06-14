import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import {
	IconChartBar,
	IconDashboard,
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
import { Link } from "@tanstack/react-router";

const data = {
	navMain: [
		{
			title: "Dashboard",
			url: "/",
			icon: IconDashboard,
		},
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
	const { data: session, isPending } = authClient.useSession();

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
				{isPending || !session?.session ? (
					<>
						{/* Main Navigation Skeleton */}
						<div className="px-3 py-2">
							<div className="space-y-2">
								{["main-nav-1", "main-nav-2", "main-nav-3"].map((key) => (
									<div
										key={key}
										className="flex items-center gap-2 px-2 py-1.5"
									>
										<Skeleton className="h-4 w-4" />
										<Skeleton className="h-4 w-20" />
									</div>
								))}
							</div>
						</div>

						{/* Developer Tools Skeleton */}
						<div className="px-3 py-2">
							<Skeleton className="mb-2 h-4 w-24" />
							<div className="space-y-2">
								{["dev-nav-1", "dev-nav-2"].map((key) => (
									<div
										key={key}
										className="flex items-center gap-2 px-2 py-1.5"
									>
										<Skeleton className="h-4 w-4" />
										<Skeleton className="h-4 w-16" />
									</div>
								))}
							</div>
						</div>

						{/* Resources Skeleton */}
						<div className="px-3 py-2">
							<Skeleton className="mb-2 h-4 w-20" />
							<div className="space-y-2">
								{["resource-nav-1", "resource-nav-2"].map((key) => (
									<div
										key={key}
										className="flex items-center gap-2 px-2 py-1.5"
									>
										<Skeleton className="h-4 w-4" />
										<Skeleton className="h-4 w-24" />
									</div>
								))}
							</div>
						</div>

						{/* Secondary Navigation Skeleton */}
						<div className="mt-auto px-3 py-2">
							<div className="space-y-2">
								{["secondary-nav-1", "secondary-nav-2"].map((key) => (
									<div
										key={key}
										className="flex items-center gap-2 px-2 py-1.5"
									>
										<Skeleton className="h-4 w-4" />
										<Skeleton className="h-4 w-16" />
									</div>
								))}
							</div>
						</div>
					</>
				) : (
					<>
						<NavMain items={data.navMain} />
						<NavDocuments items={data.webhookTools} title="Developer Tools" />
						<NavDocuments items={data.documents} title="Resources" />
						<NavSecondary items={data.navSecondary} className="mt-auto" />
					</>
				)}
			</SidebarContent>
			<SidebarFooter>
				{isPending || !session?.session ? (
					/* User Navigation Skeleton */
					<div className="flex items-center gap-2 px-2 py-2">
						<Skeleton className="size-8 rounded-full" />
						<div className="flex-1 space-y-1">
							<Skeleton className="h-3 w-20" />
							<Skeleton className="h-3 w-32" />
						</div>
					</div>
				) : (
					<NavUser user={user} />
				)}
			</SidebarFooter>
		</Sidebar>
	);
}
