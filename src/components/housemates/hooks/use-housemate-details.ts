import { getHousemateDebts, getHousemateStats } from "@/functions/housemates";
import { reportClientError } from "@/lib/client-log";
import { useCallback, useEffect, useState } from "react";
import type { HousemateDebt, HousemateStats } from "../types";

export function useHousemateDetails(
	housemateId: string | null,
	isModalOpen: boolean,
) {
	const [stats, setStats] = useState<HousemateStats | null>(null);
	const [debts, setDebts] = useState<HousemateDebt[]>([]);
	const [statsLoading, setStatsLoading] = useState(false);
	const [debtsLoading, setDebtsLoading] = useState(false);

	const loadStats = useCallback(async (id: string) => {
		try {
			setStatsLoading(true);
			const data = await getHousemateStats({ data: { housemateId: id } });
			setStats(data);
		} catch (error) {
			reportClientError({
				scope: "housemate-details",
				message: "Failed to load housemate stats",
				error,
				context: {
					housemateId: id,
					resource: "stats",
				},
			});
		} finally {
			setStatsLoading(false);
		}
	}, []);

	const loadDebts = useCallback(async (id: string) => {
		try {
			setDebtsLoading(true);
			const data = await getHousemateDebts({ data: { housemateId: id } });
			setDebts(data);
		} catch (error) {
			reportClientError({
				scope: "housemate-details",
				message: "Failed to load housemate debts",
				error,
				context: {
					housemateId: id,
					resource: "debts",
				},
			});
		} finally {
			setDebtsLoading(false);
		}
	}, []);

	useEffect(() => {
		if (housemateId && isModalOpen) {
			loadStats(housemateId);
			loadDebts(housemateId);
		}
	}, [housemateId, isModalOpen, loadStats, loadDebts]);

	return {
		stats,
		debts,
		statsLoading,
		debtsLoading,
	};
}
