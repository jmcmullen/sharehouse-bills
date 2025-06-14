import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";

import {
	HeadContent,
	Outlet,
	Scripts,
	createRootRouteWithContext,
} from "@tanstack/react-router";
import { Suspense } from "react";
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
							<div className="flex-1 p-4">
								<Suspense fallback={<PageSkeleton />}>
									<Outlet />
								</Suspense>
							</div>
						</SidebarInset>
					</SidebarProvider>
				) : (
					<div className="flex min-h-screen flex-col">
						<div className="flex-1">
							<Suspense fallback={<PageSkeleton />}>
								<Outlet />
							</Suspense>
						</div>
					</div>
				)}
				<Toaster richColors />
				<Scripts />
			</body>
		</html>
	);
}

function PageSkeleton() {
	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div className="space-y-2">
					<Skeleton className="h-8 w-24" />
					<Skeleton className="h-4 w-64" />
				</div>
				<Skeleton className="h-10 w-24" />
			</div>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				{Array.from({ length: 4 }, (_, i) => (
					<div
						key={`summary-skeleton-${i + 1}`}
						className="rounded-lg border p-6"
					>
						<div className="flex items-center justify-between space-y-0 pb-2">
							<Skeleton className="h-4 w-20" />
							<Skeleton className="h-4 w-4" />
						</div>
						<Skeleton className="h-8 w-16" />
					</div>
				))}
			</div>

			<div className="rounded-lg border">
				<div className="p-6">
					<Skeleton className="mb-4 h-6 w-32" />
					<div className="space-y-3">
						{Array.from({ length: 5 }, (_, i) => (
							<Skeleton
								key={`table-skeleton-${i + 1}`}
								className="h-12 w-full"
							/>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
