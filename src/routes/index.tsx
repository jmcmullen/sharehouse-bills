import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
	beforeLoad: async ({ context }) => {
		// Redirect to login if not authenticated (session checked in root)
		if (!context.session?.user) {
			throw redirect({
				to: "/login",
			});
		}

		// Redirect to bills page as the main landing page
		throw redirect({
			to: "/bills",
		});
	},
});
