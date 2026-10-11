DROP TRIGGER `ledger_capture_debts_insert`;--> statement-breakpoint
DROP TRIGGER `ledger_capture_debts_update`;--> statement-breakpoint
DROP TRIGGER `ledger_capture_debts_delete`;--> statement-breakpoint
DROP TRIGGER `ledger_capture_bill_update`;--> statement-breakpoint
CREATE TABLE `bank_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text,
	`amount_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`bank_status` text NOT NULL,
	`description` text NOT NULL,
	`message` text NOT NULL,
	`raw_text` text NOT NULL,
	`effective_at` integer NOT NULL,
	`raw_data` text NOT NULL,
	`housemate_id` text,
	`decision` text DEFAULT 'review' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`review_group` text,
	`decided_at` integer,
	`imported_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bank_transactions_review` ON `bank_transactions` (`decision`,`effective_at`);--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`housemate_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`received_at` integer NOT NULL,
	`kind` text NOT NULL,
	`bank_transaction_id` text,
	`note` text DEFAULT '' NOT NULL,
	`recorded_at` integer DEFAULT (unixepoch()) NOT NULL,
	`voided_at` integer,
	`void_reason` text,
	FOREIGN KEY (`housemate_id`) REFERENCES `housemates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bank_transaction_id`) REFERENCES `bank_transactions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `receipts_housemate` ON `receipts` (`housemate_id`);--> statement-breakpoint
CREATE INDEX `receipts_bank_transaction` ON `receipts` (`bank_transaction_id`);--> statement-breakpoint
CREATE TABLE `allocations` (
	`receipt_id` text NOT NULL,
	`debt_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	PRIMARY KEY(`receipt_id`, `debt_id`),
	FOREIGN KEY (`receipt_id`) REFERENCES `receipts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`debt_id`) REFERENCES `debts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `allocations_debt` ON `allocations` (`debt_id`);--> statement-breakpoint
CREATE TABLE `allocation_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`receipt_id` text NOT NULL,
	`debt_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`recorded_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bill_reviews` (
	`bill_id` text PRIMARY KEY NOT NULL,
	`reviewed_at` integer NOT NULL
);
--> statement-breakpoint
-- Data migration. Every expression that could miss a row resolves to NULL and
-- lands in a NOT NULL column, so an unexpected row stops the migration instead
-- of being skipped.
-- An admin decision is anything reviewed, plus every row that already carries
-- credited money, so re-ingest never reclassifies a transaction with receipts.
INSERT INTO `bank_transactions`(`id`,`account_id`,`amount_cents`,`currency`,`bank_status`,`description`,`message`,`raw_text`,`effective_at`,`raw_data`,`housemate_id`,`decision`,`reason`,`review_group`,`decided_at`,`imported_at`,`updated_at`)
SELECT `id`,`account_id`,`amount_cents`,`currency`,`bank_status`,`description`,`message`,`raw_text`,`effective_at`,`raw_data`,`housemate_id`,
	CASE `decision` WHEN 'review' THEN 'review' WHEN 'credit' THEN 'confirmed' WHEN 'linked' THEN 'confirmed' WHEN 'exclude' THEN 'excluded' WHEN 'archive' THEN 'archived' END,
	`reason`,`review_group`,
	CASE WHEN `decision_origin`='review' OR `decision` IN ('credit','linked') THEN `updated_at` END,
	`imported_at`,`updated_at`
FROM `ledger_bank_transactions`;--> statement-breakpoint
-- One receipt per live payment, refund or adjustment source in the journal.
CREATE TABLE `receipt_keys` (
	`source_key` text PRIMARY KEY NOT NULL,
	`receipt_id` text NOT NULL UNIQUE,
	`housemate_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`effective_at` integer NOT NULL,
	`recorded_at` integer NOT NULL,
	`description` text NOT NULL,
	`transaction_id` text
);
--> statement-breakpoint
INSERT INTO `receipt_keys`
SELECT s.`source_key`,lower(hex(randomblob(12))),e.`housemate_id`,-e.`amount_cents`,e.`effective_at`,e.`recorded_at`,e.`description`,
	CASE
		WHEN s.`source_key` LIKE 'bank:%' THEN CASE WHEN instr(substr(s.`source_key`,6),':')>0 THEN substr(s.`source_key`,6,instr(substr(s.`source_key`,6),':')-1) ELSE substr(s.`source_key`,6) END
		WHEN s.`source_key` LIKE 'manual:cash-%' OR s.`source_key` LIKE 'manual:ledger-%' THEN NULL
		ELSE (SELECT ev.`transaction_id` FROM `ledger_payment_evidence` ev WHERE ev.`source_key`=s.`source_key`)
	END
FROM `ledger_sources` s JOIN `ledger_entries` e ON e.`id`=s.`entry_id`
WHERE e.`kind` IN ('payment','refund','adjustment');--> statement-breakpoint
INSERT INTO `receipts`(`id`,`housemate_id`,`amount_cents`,`received_at`,`kind`,`bank_transaction_id`,`note`,`recorded_at`)
SELECT k.`receipt_id`,
	(SELECT h.`id` FROM `housemates` h WHERE h.`id`=k.`housemate_id`),
	k.`amount_cents`,
	CASE WHEN k.`source_key` LIKE 'manual:%' AND k.`transaction_id` IS NOT NULL THEN (SELECT b.`effective_at` FROM `bank_transactions` b WHERE b.`id`=k.`transaction_id`) ELSE k.`effective_at` END,
	CASE
		WHEN k.`source_key` LIKE 'bank:%' AND k.`transaction_id` IN (SELECT `id` FROM `bank_transactions`) THEN 'bank'
		WHEN k.`source_key` LIKE 'manual:%' AND k.`transaction_id` IS NULL THEN 'cash'
		WHEN k.`source_key` LIKE 'manual:%' AND k.`transaction_id` IN (SELECT `id` FROM `bank_transactions`) THEN 'bank'
	END,
	k.`transaction_id`,
	CASE
		WHEN k.`source_key` LIKE 'bank:%' THEN ''
		WHEN k.`source_key` LIKE 'manual:cash-%' AND k.`description`='Cash received' THEN ''
		WHEN k.`source_key` LIKE 'manual:cash-%' AND k.`description` LIKE 'Cash received · %' THEN substr(k.`description`,17)
		ELSE k.`description`
	END,
	CASE WHEN k.`source_key` LIKE 'manual:ledger-%' OR k.`source_key` LIKE 'manual:cash-%' OR k.`source_key` LIKE 'bank:%' THEN k.`recorded_at` ELSE k.`effective_at` END
FROM `receipt_keys` k;--> statement-breakpoint
INSERT INTO `allocations`(`receipt_id`,`debt_id`,`amount_cents`)
SELECT (SELECT k.`receipt_id` FROM `receipt_keys` k WHERE k.`source_key`=a.`source_key`),
	(SELECT d.`id` FROM `debts` d WHERE d.`id`=a.`debt_id`),
	a.`amount_cents`
FROM `ledger_bill_allocations` a;--> statement-breakpoint
INSERT INTO `allocation_history`(`receipt_id`,`debt_id`,`amount_cents`,`recorded_at`)
SELECT coalesce((SELECT k.`receipt_id` FROM `receipt_keys` k WHERE k.`source_key`=h.`source_key`),h.`source_key`),h.`debt_id`,h.`amount_cents`,h.`recorded_at`
FROM `ledger_allocation_history` h ORDER BY h.`id`;--> statement-breakpoint
INSERT INTO `bill_reviews`(`bill_id`,`reviewed_at`) SELECT `bill_id`,`reviewed_at` FROM `ledger_bill_reviews`;--> statement-breakpoint
-- Totals must survive the move and no bank event may still be waiting for the
-- journal; a failed check aborts the migration.
CREATE TABLE `receipts_migration_check` (
	`receipts_match_sources` integer NOT NULL CHECK (`receipts_match_sources`=1),
	`allocations_match` integer NOT NULL CHECK (`allocations_match`=1),
	`bank_receipts_have_transactions` integer NOT NULL CHECK (`bank_receipts_have_transactions`=1),
	`bank_events_processed` integer NOT NULL CHECK (`bank_events_processed`=1)
);
--> statement-breakpoint
INSERT INTO `receipts_migration_check` SELECT
	(SELECT count(*) FROM `receipts`)=(SELECT count(*) FROM `receipt_keys`) AND (SELECT coalesce(sum(`amount_cents`),0) FROM `receipts`)=(SELECT coalesce(sum(`amount_cents`),0) FROM `receipt_keys`),
	(SELECT count(*) FROM `allocations`)=(SELECT count(*) FROM `ledger_bill_allocations`) AND (SELECT coalesce(sum(`amount_cents`),0) FROM `allocations`)=(SELECT coalesce(sum(`amount_cents`),0) FROM `ledger_bill_allocations`),
	NOT EXISTS (SELECT 1 FROM `receipts` WHERE `kind`='bank' AND `bank_transaction_id` IS NULL),
	NOT EXISTS (SELECT 1 FROM `ledger_events` WHERE `kind`='bank' AND `processed_at` IS NULL);--> statement-breakpoint
DROP TABLE `receipts_migration_check`;--> statement-breakpoint
DROP TABLE `receipt_keys`;--> statement-breakpoint
DROP TABLE `ledger_allocation_history`;--> statement-breakpoint
DROP TABLE `ledger_bill_allocations`;--> statement-breakpoint
DROP TABLE `ledger_allocation_reviews`;--> statement-breakpoint
DROP TABLE `ledger_payment_evidence`;--> statement-breakpoint
DROP TABLE `ledger_bank_allocations`;--> statement-breakpoint
DROP TABLE `ledger_events`;--> statement-breakpoint
DROP TABLE `ledger_entries`;--> statement-breakpoint
DROP TABLE `ledger_sources`;--> statement-breakpoint
DROP TABLE `ledger_bill_reviews`;--> statement-breakpoint
DROP TABLE `ledger_bank_transactions`;
