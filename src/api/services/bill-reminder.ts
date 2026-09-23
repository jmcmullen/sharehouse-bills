import { getReminderScheduledForDate } from "../../lib/bill-reminder-schedule";
import { uncoveredShares } from "./bill-reminder-credit";
import {
	getReminderCandidateRows,
	getReminderKindForRow,
} from "./bill-reminder-preview";
import { getCredits } from "./ledger/credit.server";
import { enqueueBillReminderNotification } from "./whatsapp-notification-events";

export async function enqueueDueBillReminders(targetDate: Date) {
	const scheduledForDate = getReminderScheduledForDate(targetDate);
	const scheduledForDateIso = scheduledForDate.toISOString();
	const candidates = await getReminderCandidateRows();
	const rows = uncoveredShares(
		candidates,
		await getCredits(candidates.map((row) => row.housemateId)),
	);

	let scheduledCount = 0;

	for (const row of rows) {
		if (!row.whatsappNumber) {
			continue;
		}

		const kind = getReminderKindForRow({
			row,
			targetDate: scheduledForDate,
		});
		if (!kind) {
			continue;
		}

		await enqueueBillReminderNotification({
			eventKey: `bill-reminder:${row.billId}:${row.housemateId}:${scheduledForDateIso}`,
			billId: row.billId,
			housemateId: row.housemateId,
			payload: {
				mode: "individual",
				kind,
				scheduledForDate: scheduledForDateIso,
			},
		});
		scheduledCount += 1;
	}

	return {
		scheduledCount,
		stackedGroupCount: 0,
		checkedDebtCount: candidates.length,
	};
}
