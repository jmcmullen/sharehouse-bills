ALTER TABLE `payment_transactions`
ADD `source` text DEFAULT 'up_bank' NOT NULL;--> statement-breakpoint

ALTER TABLE `payment_transactions`
ADD `credit_amount` real DEFAULT 0 NOT NULL;--> statement-breakpoint

UPDATE `payment_transactions`
SET
	`source` = CASE
		WHEN `match_type` = 'manual_match' THEN 'manual_reconciliation'
		ELSE 'up_bank'
	END,
	`credit_amount` = 0;--> statement-breakpoint

INSERT INTO `payment_transactions` (
	`id`,
	`transaction_id`,
	`description`,
	`amount`,
	`housemate_id`,
	`status`,
	`source`,
	`match_type`,
	`matched_debt_ids`,
	`raw_data`,
	`credit_amount`,
	`settled_at`,
	`up_created_at`,
	`created_at`,
	`updated_at`
)
SELECT
	lower(hex(randomblob(16))),
	'manual-backfill-' || `debts`.`id`,
	'Manual payment for ' || `bills`.`biller_name`,
	`debts`.`amount_paid`,
	`debts`.`housemate_id`,
	'matched',
	'manual_admin',
	'manual_match',
	json_array(`debts`.`id`),
	json_object('backfill', 1, 'reason', 'historical_manual_payment'),
	0,
	coalesce(`debts`.`paid_at`, `debts`.`updated_at`, `debts`.`created_at`),
	NULL,
	coalesce(`debts`.`paid_at`, `debts`.`updated_at`, `debts`.`created_at`),
	coalesce(`debts`.`paid_at`, `debts`.`updated_at`, `debts`.`created_at`)
FROM `debts`
INNER JOIN `bills` ON `bills`.`id` = `debts`.`bill_id`
INNER JOIN `housemates` ON `housemates`.`id` = `debts`.`housemate_id`
WHERE
	`debts`.`amount_paid` > 0
	AND `housemates`.`is_owner` = 0
	AND NOT EXISTS (
		SELECT
			1
		FROM `payment_transactions`
		INNER JOIN json_each(coalesce(`payment_transactions`.`matched_debt_ids`, '[]')) AS `matched_debt`
			ON 1 = 1
		WHERE `matched_debt`.`value` = `debts`.`id`
	);
