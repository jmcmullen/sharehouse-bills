import { AppSidebar } from "@/components/app-sidebar";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";

import {
	HeadContent,
	Outlet,
	Scripts,
	createRootRouteWithContext,
} from "@tanstack/react-router";
import { useTheme } from "../hooks/use-theme";
import appCss from "../index.css?url";

import { serverAuth } from "@/lib/auth-server";
import type { Session } from "better-auth";
export interface RouterAppContext {
	session?: Session;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
	beforeLoad: async ({ context }) => {
		const session = await serverAuth();
		return { ...context, ...session };
	},

	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "Sharehouse Bills",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),

	component: RootDocument,
});

function RootDocument() {
	const { session } = Route.useRouteContext();
	useTheme();

	const isAuthenticated = !!session?.user;

	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				{isAuthenticated ? (
					<SidebarProvider>
						<AppSidebar />
						<SidebarInset>
							<header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
								<div className="flex items-center gap-2 px-4">
									<SidebarTrigger className="-ml-1" />
								</div>
							</header>
							<div className="flex-1 p-4">
								<Outlet />
							</div>
						</SidebarInset>
					</SidebarProvider>
				) : (
					<div className="flex min-h-screen flex-col">
						<div className="flex-1">
							<Outlet />
						</div>
					</div>
				)}
				<Toaster richColors />
				<Scripts />
			</body>
		</html>
	);
}
