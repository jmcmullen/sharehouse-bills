import { getReminderScheduledForDate } from "../../lib/bill-reminder-schedule";
import {
	getReminderCandidateRows,
	getReminderKindForRow,
} from "./bill-reminder-preview";
import { enqueueBillReminderNotification } from "./whatsapp-notification-events";

export async function enqueueDueBillReminders(targetDate: Date) {
	const scheduledForDate = getReminderScheduledForDate(targetDate);
	const scheduledForDateIso = scheduledForDate.toISOString();
	const rows = await getReminderCandidateRows();

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
		checkedDebtCount: rows.length,
	};
}
