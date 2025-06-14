import { useMemo, useState } from "react";
import { PAGINATION_CONFIG } from "../utils";

export function usePagination<T>(items: T[]) {
	const [currentPage, setCurrentPage] = useState(1);
	const { itemsPerPage } = PAGINATION_CONFIG;

	const paginationData = useMemo(() => {
		const totalPages = Math.ceil(items.length / itemsPerPage);
		const startIndex = (currentPage - 1) * itemsPerPage;
		const endIndex = startIndex + itemsPerPage;
		const paginatedItems = items.slice(startIndex, endIndex);

		return {
			totalPages,
			startIndex,
			endIndex,
			paginatedItems,
		};
	}, [items, currentPage, itemsPerPage]);

	const goToPage = (page: number) => {
		setCurrentPage(Math.max(1, Math.min(paginationData.totalPages, page)));
	};

	const goToPrevious = () => {
		setCurrentPage((prev) => Math.max(1, prev - 1));
	};

	const goToNext = () => {
		setCurrentPage((prev) => Math.min(paginationData.totalPages, prev + 1));
	};

	return {
		currentPage,
		...paginationData,
		goToPage,
		goToPrevious,
		goToNext,
	};
}
