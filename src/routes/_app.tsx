import { AppSidebar } from "@/components/app-sidebar";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app")({
	beforeLoad: async ({ context }) => {
		if (!context.session?.user) {
			throw redirect({
				to: "/login",
			});
		}
	},
	component: AppLayout,
});

function AppLayout() {
	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 md:hidden">
					<SidebarTrigger className="-ml-2 size-9" />
					<span className="font-semibold">Sharehouse Bills</span>
				</header>
				<div className="min-w-0 flex-1 p-4">
					<Outlet />
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
