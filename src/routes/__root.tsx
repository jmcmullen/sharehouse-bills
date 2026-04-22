import { ThemeProvider } from "@/components/theme-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { serverAuth } from "@/lib/auth-server";
import type { Session } from "better-auth";
import { evlogErrorHandler } from "evlog/nitro/v3";

import {
	HeadContent,
	Outlet,
	Scripts,
	createRootRouteWithContext,
} from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";
import { Suspense } from "react";
import appCss from "../index.css?url";

export interface RouterAppContext {
	session?: Session;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
	server: {
		middleware: [createMiddleware().server(evlogErrorHandler)],
	},

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
				content: "width=device-width, initial-scale=1, viewport-fit=cover",
			},
			{
				title: "Sharehouse Bills",
			},
			{
				property: "og:site_name",
				content: "Sharehouse Bills",
			},
			{
				property: "og:locale",
				content: "en_AU",
			},
			{
				name: "theme-color",
				content: "#1f221b",
			},
			{
				name: "color-scheme",
				content: "dark",
			},
		],
		links: [
			{
				rel: "preconnect",
				href: "https://fonts.googleapis.com",
			},
			{
				rel: "preconnect",
				href: "https://fonts.gstatic.com",
				crossOrigin: "anonymous",
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap",
			},
			{
				rel: "icon",
				type: "image/svg+xml",
				href: "/icon.svg",
			},
			{
				rel: "apple-touch-icon",
				href: "/icon.svg",
			},
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),

	component: RootDocument,
});

function RootDocument() {
	return (
		<html lang="en-AU" className="dark" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body>
				<ThemeProvider
					attribute="class"
					forcedTheme="dark"
					disableTransitionOnChange
				>
					<div className="flex min-h-screen flex-col">
						<div className="flex-1">
							<Suspense fallback={<PageSkeleton />}>
								<Outlet />
							</Suspense>
						</div>
					</div>
					<Toaster richColors />
				</ThemeProvider>
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
