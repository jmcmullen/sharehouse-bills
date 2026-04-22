CREATE TABLE `whatsapp_notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_key` text NOT NULL,
	`event_type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`bill_id` integer,
	`debt_id` integer,
	`housemate_id` integer,
	`inbound_message_id` text,
	`inbound_chat_id` text,
	`inbound_sender_chat_id` text,
	`error_message` text,
	`payload` text,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`debt_id`) REFERENCES `debts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`housemate_id`) REFERENCES `housemates`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_notifications_event_key_idx` ON `whatsapp_notifications` (`event_key`);--> statement-breakpoint
CREATE INDEX `whatsapp_notifications_event_type_idx` ON `whatsapp_notifications` (`event_type`);--> statement-breakpoint
CREATE INDEX `whatsapp_notifications_status_idx` ON `whatsapp_notifications` (`status`);--> statement-breakpoint
ALTER TABLE `housemates` ADD `whatsapp_number` text;--> statement-breakpoint
CREATE UNIQUE INDEX `housemates_whatsapp_number_unique` ON `housemates` (`whatsapp_number`);