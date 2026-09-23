ALTER TABLE `housemates` DROP COLUMN `credit_balance`;
--> statement-breakpoint
INSERT INTO ledger_events(kind,source_id,payload) VALUES('allocations','auto','{}');
