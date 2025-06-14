import { getHousemateDebts, getHousemateStats } from "@/functions/housemates";
import { useCallback, useEffect, useState } from "react";
import type { HousemateDebt, HousemateStats } from "../types";

export function useHousemateDetails(
	housemateId: number | null,
	isModalOpen: boolean,
) {
	const [stats, setStats] = useState<HousemateStats | null>(null);
	const [debts, setDebts] = useState<HousemateDebt[]>([]);
	const [statsLoading, setStatsLoading] = useState(false);
	const [debtsLoading, setDebtsLoading] = useState(false);

	const loadStats = useCallback(async (id: number) => {
		try {
			setStatsLoading(true);
			const data = await getHousemateStats({ data: { housemateId: id } });
			setStats(data);
		} catch (error) {
			console.error("Failed to load housemate stats:", error);
		} finally {
			setStatsLoading(false);
		}
	}, []);

	const loadDebts = useCallback(async (id: number) => {
		try {
			setDebtsLoading(true);
			const data = await getHousemateDebts({ data: { housemateId: id } });
			setDebts(data);
		} catch (error) {
			console.error("Failed to load housemate debts:", error);
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
