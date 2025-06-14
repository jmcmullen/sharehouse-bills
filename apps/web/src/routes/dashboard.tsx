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
		<div className="container mx-auto px-4 py-8">
			<h1 className="mb-6 font-bold text-3xl">Dashboard</h1>
			<p className="mb-4 text-lg">Welcome {session?.user.name}</p>

			<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
				{/* System Status */}
				<div className="rounded-lg bg-white p-6 shadow-md">
					<h2 className="mb-4 font-semibold text-xl">System Status</h2>
					<div className="space-y-2">
						<p>
							<span className="font-medium">API Status:</span>{" "}
							<span
								className={`inline-flex items-center rounded-full px-2 py-1 font-medium text-xs ${
									healthCheck.isLoading
										? "bg-yellow-100 text-yellow-800"
										: healthCheck.error
											? "bg-red-100 text-red-800"
											: "bg-green-100 text-green-800"
								}`}
							>
								{healthCheck.isLoading
									? "Loading..."
									: healthCheck.error
										? "Disconnected"
										: "Connected"}
							</span>
						</p>
						<p>
							<span className="font-medium">Health Check:</span>{" "}
							{healthCheck.data}
						</p>
						<p>
							<span className="font-medium">User Data:</span>{" "}
							{privateData.data?.message}
						</p>
						{privateData.error && (
							<p className="text-red-600">Error: {privateData.error.message}</p>
						)}
					</div>
				</div>

				{/* Quick Actions */}
				<div className="rounded-lg bg-white p-6 shadow-md">
					<h2 className="mb-4 font-semibold text-xl">Quick Actions</h2>
					<div className="space-y-3">
						<a
							href="/test-webhook"
							className="block w-full rounded-md bg-blue-600 px-4 py-2 text-center font-medium text-white transition-colors hover:bg-blue-700"
						>
							🤖 Test PDF Processing
						</a>
						<a
							href="/todos"
							className="block w-full rounded-md bg-gray-600 px-4 py-2 text-center font-medium text-white transition-colors hover:bg-gray-700"
						>
							📝 View Todos
						</a>
						<a
							href="/api/rpc/bills.getAllBills"
							target="_blank"
							className="block w-full rounded-md bg-green-600 px-4 py-2 text-center font-medium text-white transition-colors hover:bg-green-700"
							rel="noreferrer"
						>
							📄 View Bills (API)
						</a>
						<a
							href="/api/rpc/housemates.getAllHousemates"
							target="_blank"
							className="block w-full rounded-md bg-purple-600 px-4 py-2 text-center font-medium text-white transition-colors hover:bg-purple-700"
							rel="noreferrer"
						>
							👥 View Housemates (API)
						</a>
					</div>
				</div>
			</div>
		</div>
	);
}
