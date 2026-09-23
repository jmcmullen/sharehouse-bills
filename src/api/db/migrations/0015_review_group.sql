ALTER TABLE `ledger_bank_transactions` ADD `review_group` text;
--> statement-breakpoint
UPDATE ledger_bank_transactions SET review_group=CASE
WHEN amount_cents<0 THEN 'outgoing'
WHEN reason LIKE 'Possible existing manual payment:%' THEN 'duplicate'
WHEN housemate_id IS NULL OR reason LIKE 'Multiple housemates%' THEN 'assignment'
ELSE 'purpose' END;
--> statement-breakpoint
CREATE TABLE `ledger_allocation_issues` (
	`source_key` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`recorded_at` integer DEFAULT (unixepoch()) NOT NULL
);
