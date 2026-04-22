CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `bills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`biller_name` text NOT NULL,
	`provider` text,
	`bill_type` text,
	`total_amount` real NOT NULL,
	`due_date` integer NOT NULL,
	`statement_date` integer,
	`charge_due_date` integer,
	`bill_period_start` integer,
	`bill_period_end` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`account_number` text,
	`reference_number` text,
	`source_filename` text,
	`parse_method` text,
	`parse_confidence` real,
	`source_fingerprint` text,
	`pdf_sha256` text,
	`pdf_url` text,
	`recurring_bill_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`recurring_bill_id`) REFERENCES `recurringBills`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bills_pdf_sha256_idx` ON `bills` (`pdf_sha256`);--> statement-breakpoint
CREATE UNIQUE INDEX `bills_source_fingerprint_idx` ON `bills` (`source_fingerprint`);--> statement-breakpoint
CREATE TABLE `debts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bill_id` integer NOT NULL,
	`housemate_id` integer NOT NULL,
	`amount_owed` real NOT NULL,
	`is_paid` integer DEFAULT false NOT NULL,
	`paid_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`housemate_id`) REFERENCES `housemates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `housemates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`bank_alias` text,
	`is_active` integer DEFAULT true NOT NULL,
	`is_owner` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `housemates_email_unique` ON `housemates` (`email`);--> statement-breakpoint
CREATE TABLE `recurringBills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`templateName` text NOT NULL,
	`billerName` text NOT NULL,
	`totalAmount` real NOT NULL,
	`frequency` text NOT NULL,
	`dayOfWeek` integer,
	`dayOfMonth` integer,
	`startDate` integer NOT NULL,
	`endDate` integer,
	`isActive` integer DEFAULT true NOT NULL,
	`splitStrategy` text DEFAULT 'equal' NOT NULL,
	`lastGeneratedDate` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recurringBillAssignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recurringBillId` integer NOT NULL,
	`housemateId` integer NOT NULL,
	`customAmount` real,
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`recurringBillId`) REFERENCES `recurringBills`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`housemateId`) REFERENCES `housemates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `unreconciled_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transaction_id` text NOT NULL,
	`description` text NOT NULL,
	`amount` real NOT NULL,
	`reason` text NOT NULL,
	`raw_data` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unreconciled_transactions_transaction_id_unique` ON `unreconciled_transactions` (`transaction_id`);--> statement-breakpoint
CREATE TABLE `todo` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`text` text NOT NULL,
	`completed` integer DEFAULT false NOT NULL
);
