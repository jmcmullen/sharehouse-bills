import SignInForm from "@/components/sign-in-form";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({
	head: () => ({
		meta: [
			{ title: "Sign in · Sharehouse Bills" },
			{ name: "robots", content: "noindex, nofollow" },
		],
	}),
	component: RouteComponent,
});

function RouteComponent() {
	return <SignInForm />;
}
