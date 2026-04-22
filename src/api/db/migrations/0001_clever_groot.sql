CREATE TABLE `payment_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transaction_id` text NOT NULL,
	`description` text NOT NULL,
	`amount` real NOT NULL,
	`housemate_id` integer,
	`status` text DEFAULT 'unreconciled' NOT NULL,
	`match_type` text NOT NULL,
	`matched_debt_ids` text,
	`raw_data` text,
	`settled_at` integer,
	`up_created_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`housemate_id`) REFERENCES `housemates`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_transactions_transaction_id_idx` ON `payment_transactions` (`transaction_id`);