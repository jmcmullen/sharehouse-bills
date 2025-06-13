import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/dashboard")({
	component: RouteComponent,
});

function RouteComponent() {
	const navigate = Route.useNavigate();
	const { data: session, isPending } = authClient.useSession();

	const healthCheck = useQuery(orpc.healthCheck.queryOptions());
	const privateData = useQuery(orpc.privateData.queryOptions());

	useEffect(() => {
		if (!session && !isPending) {
			navigate({
				to: "/login",
			});
		}
	}, [session, isPending, navigate]);

	if (isPending) {
		return <div>Loading...</div>;
	}

	return (
		<div>
			<h1>Dashboard</h1>
			<p>Welcome {session?.user.name}</p>
			<p>
				API Status:{" "}
				{healthCheck.isLoading
					? "Loading..."
					: healthCheck.error
						? "Disconnected"
						: "Connected"}
			</p>
			<p>Health Check: {healthCheck.data}</p>
			<p>privateData: {privateData.data?.message}</p>
			{privateData.error && <p>Error: {privateData.error.message}</p>}
		</div>
	);
}
