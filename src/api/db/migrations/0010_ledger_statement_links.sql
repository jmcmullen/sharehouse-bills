CREATE TABLE `ledger_statement_links` (
	`housemate_id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_statement_links_token_hash_unique` ON `ledger_statement_links` (`token_hash`);
--> statement-breakpoint
INSERT INTO ledger_events(kind,source_id,payload)
SELECT 'bank',id,raw_data FROM ledger_bank_transactions
WHERE decision='credit' AND decision_origin!='review';
