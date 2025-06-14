import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
	beforeLoad: async ({ context }) => {
		// Redirect to login if not authenticated (session checked in root)
		if (!context.session?.user) {
			throw redirect({
				to: "/login",
			});
		}
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { session } = Route.useRouteContext();

	return (
		<div className="container mx-auto px-4 py-8">
			<h1 className="mb-6 font-bold text-3xl">Dashboard</h1>
			<p className="mb-4 text-lg">Welcome {session?.user.name}</p>
		</div>
	);
}
