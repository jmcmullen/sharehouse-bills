ALTER TABLE `bills` DROP COLUMN `reminders_enabled`;
--> statement-breakpoint
ALTER TABLE `bills` DROP COLUMN `reminder_mode`;
--> statement-breakpoint
ALTER TABLE `bills` DROP COLUMN `pre_due_offsets_days`;
--> statement-breakpoint
ALTER TABLE `bills` DROP COLUMN `overdue_cadence`;
--> statement-breakpoint
ALTER TABLE `bills` DROP COLUMN `overdue_weekday`;
--> statement-breakpoint
ALTER TABLE `recurringBills` DROP COLUMN `remindersEnabled`;
--> statement-breakpoint
ALTER TABLE `recurringBills` DROP COLUMN `reminderMode`;
--> statement-breakpoint
ALTER TABLE `recurringBills` DROP COLUMN `preDueOffsetsDays`;
--> statement-breakpoint
ALTER TABLE `recurringBills` DROP COLUMN `overdueCadence`;
--> statement-breakpoint
ALTER TABLE `recurringBills` DROP COLUMN `overdueWeekday`;
--> statement-breakpoint
UPDATE `whatsapp_notifications` SET `status`='ignored',`error_message`='per-bill reminders and debt-paid links were retired',`completed_at`=CAST(strftime('%s','now') AS INTEGER),`updated_at`=CAST(strftime('%s','now') AS INTEGER) WHERE `event_type` IN ('bill_reminder','debt_paid') AND `status` IN ('pending','failed');
