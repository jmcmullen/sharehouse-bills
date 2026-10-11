import { getHousemateAccount } from "@/functions/housemates";
import { reportClientError } from "@/lib/client-log";
import { useEffect, useState } from "react";
import type { HousemateAccount } from "../types";

export function useHousemateDetails(
	housemateId: string | null,
	isModalOpen: boolean,
) {
	const [account, setAccount] = useState<HousemateAccount | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	useEffect(() => {
		if (!housemateId || !isModalOpen) return;
		setIsLoading(true);
		getHousemateAccount({ data: { housemateId } })
			.then(setAccount)
			.catch((error) =>
				reportClientError({
					scope: "housemate-details",
					message: "Failed to load housemate account",
					error,
					context: { housemateId, resource: "account" },
				}),
			)
			.finally(() => setIsLoading(false));
	}, [housemateId, isModalOpen]);

	return { account, isLoading };
}
