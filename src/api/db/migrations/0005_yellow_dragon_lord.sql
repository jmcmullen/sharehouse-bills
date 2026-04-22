ALTER TABLE `bills` ADD `reminders_enabled` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `bills` ADD `reminder_mode` text DEFAULT 'individual' NOT NULL;--> statement-breakpoint
ALTER TABLE `bills` ADD `stack_group` text;--> statement-breakpoint
ALTER TABLE `bills` ADD `pre_due_offsets_days` text DEFAULT '[1,0]' NOT NULL;--> statement-breakpoint
ALTER TABLE `bills` ADD `overdue_cadence` text DEFAULT 'weekly' NOT NULL;--> statement-breakpoint
ALTER TABLE `bills` ADD `overdue_weekday` integer DEFAULT 2;--> statement-breakpoint
ALTER TABLE `recurringBills` ADD `remindersEnabled` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `recurringBills` ADD `reminderMode` text DEFAULT 'individual' NOT NULL;--> statement-breakpoint
ALTER TABLE `recurringBills` ADD `stackGroup` text;--> statement-breakpoint
ALTER TABLE `recurringBills` ADD `preDueOffsetsDays` text DEFAULT '[1,0]' NOT NULL;--> statement-breakpoint
ALTER TABLE `recurringBills` ADD `overdueCadence` text DEFAULT 'weekly' NOT NULL;--> statement-breakpoint
ALTER TABLE `recurringBills` ADD `overdueWeekday` integer DEFAULT 2;--> statement-breakpoint

UPDATE `bills`
SET
	`reminders_enabled` = 1,
	`reminder_mode` = 'individual',
	`stack_group` = NULL,
	`pre_due_offsets_days` = '[1,0]',
	`overdue_cadence` = 'weekly',
	`overdue_weekday` = 2;--> statement-breakpoint

UPDATE `recurringBills`
SET
	`remindersEnabled` = 1,
	`reminderMode` = 'individual',
	`stackGroup` = NULL,
	`preDueOffsetsDays` = '[1,0]',
	`overdueCadence` = 'weekly',
	`overdueWeekday` = 2;--> statement-breakpoint

UPDATE `bills`
SET
	`reminder_mode` = 'stacked',
	`stack_group` = 'utilities',
	`pre_due_offsets_days` = '[]',
	`overdue_cadence` = 'weekly',
	`overdue_weekday` = 2
WHERE
	`bill_type` IN ('electricity', 'gas')
	OR lower(coalesce(`biller_name`, '')) LIKE '%electric%'
	OR lower(coalesce(`biller_name`, '')) LIKE '%gas%'
	OR lower(coalesce(`source_filename`, '')) LIKE '%electric%'
	OR lower(coalesce(`source_filename`, '')) LIKE '%gas%';--> statement-breakpoint

UPDATE `recurringBills`
SET
	`reminderMode` = 'stacked',
	`stackGroup` = 'utilities',
	`preDueOffsetsDays` = '[]',
	`overdueCadence` = 'weekly',
	`overdueWeekday` = 2
WHERE
	lower(coalesce(`billerName`, '')) LIKE '%electric%'
	OR lower(coalesce(`billerName`, '')) LIKE '%gas%'
	OR lower(coalesce(`templateName`, '')) LIKE '%electric%'
	OR lower(coalesce(`templateName`, '')) LIKE '%gas%';--> statement-breakpoint

UPDATE `bills`
SET
	`reminder_mode` = 'individual',
	`stack_group` = NULL,
	`pre_due_offsets_days` = '[2,1,0]',
	`overdue_cadence` = 'daily',
	`overdue_weekday` = NULL
WHERE
	lower(coalesce(`biller_name`, '')) LIKE '%rent%'
	OR lower(coalesce(`source_filename`, '')) LIKE '%rent%';--> statement-breakpoint

UPDATE `recurringBills`
SET
	`reminderMode` = 'individual',
	`stackGroup` = NULL,
	`preDueOffsetsDays` = '[2,1,0]',
	`overdueCadence` = 'daily',
	`overdueWeekday` = NULL
WHERE
	lower(coalesce(`billerName`, '')) LIKE '%rent%'
	OR lower(coalesce(`templateName`, '')) LIKE '%rent%';
