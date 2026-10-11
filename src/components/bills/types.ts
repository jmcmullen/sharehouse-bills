import type { getAllBills } from "@/functions/bills";

type BillsData = Awaited<ReturnType<typeof getAllBills>>;
export type BillListItem = BillsData["bills"][number];
export type BillSummary = BillsData["summary"];
export type BillListShare = BillListItem["shares"][number];

export interface UploadResult {
	success: boolean;
	message: string;
	billId?: string;
	error?: string;
}
