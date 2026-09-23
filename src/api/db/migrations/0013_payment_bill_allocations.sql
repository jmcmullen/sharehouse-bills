CREATE TABLE `ledger_allocation_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_key` text NOT NULL,
	`debt_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`origin` text NOT NULL,
	`recorded_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ledger_bill_allocations` (
	`source_key` text NOT NULL,
	`debt_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`origin` text NOT NULL,
	PRIMARY KEY(`source_key`, `debt_id`)
);
--> statement-breakpoint
CREATE TABLE `ledger_payment_evidence` (
	`transaction_id` text NOT NULL,
	`source_key` text NOT NULL,
	`amount_cents` integer NOT NULL,
	PRIMARY KEY(`transaction_id`, `source_key`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_payment_evidence_source_key_unique` ON `ledger_payment_evidence` (`source_key`);--> statement-breakpoint
INSERT INTO ledger_payment_evidence(transaction_id,source_key,amount_cents)
SELECT id,linked_source_key,amount_cents FROM ledger_bank_transactions
WHERE decision='linked' AND linked_source_key IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER ledger_allocation_history_no_update BEFORE UPDATE ON ledger_allocation_history BEGIN SELECT RAISE(ABORT,'Allocation history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER ledger_allocation_history_no_delete BEFORE DELETE ON ledger_allocation_history BEGIN SELECT RAISE(ABORT,'Allocation history is immutable'); END;
--> statement-breakpoint
INSERT INTO ledger_events(kind,source_id,payload) VALUES('allocations','legacy','{}');
