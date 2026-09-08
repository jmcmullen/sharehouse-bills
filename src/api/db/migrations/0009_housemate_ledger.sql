CREATE TABLE `ledger_bank_transactions` (
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
	`decision_origin` text DEFAULT 'automatic' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`linked_source_key` text,
	`imported_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ledger_bank_review` ON `ledger_bank_transactions` (`decision`,`effective_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_bank_manual_link` ON `ledger_bank_transactions` (`linked_source_key`);--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`housemate_id` text NOT NULL,
	`source_key` text NOT NULL,
	`kind` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`description` text NOT NULL,
	`bill_id` text,
	`effective_at` integer NOT NULL,
	`due_at` integer,
	`recorded_at` integer NOT NULL,
	`reverses_entry_id` text
);
--> statement-breakpoint
CREATE INDEX `ledger_entries_account_date` ON `ledger_entries` (`housemate_id`,`effective_at`);--> statement-breakpoint
CREATE TABLE `ledger_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`source_id` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`processed_at` integer
);
--> statement-breakpoint
CREATE INDEX `ledger_events_pending` ON `ledger_events` (`processed_at`,`id`);--> statement-breakpoint
CREATE TABLE `ledger_sources` (
	`source_key` text PRIMARY KEY NOT NULL,
	`entry_id` text,
	`snapshot` text NOT NULL
);

--> statement-breakpoint
CREATE TRIGGER ledger_capture_debts_insert AFTER INSERT ON debts
BEGIN
 INSERT INTO ledger_events(kind,source_id,payload) VALUES ('charge', NEW.id, json_object('id',NEW.id,'housemateId',NEW.housemate_id,'billId',NEW.bill_id,'amount',NEW.amount_owed,'effectiveAt',NEW.created_at,'dueAt',(SELECT due_date FROM bills WHERE id=NEW.bill_id),'description',coalesce((SELECT biller_name FROM bills WHERE id=NEW.bill_id), 'Deleted bill')));
END;
--> statement-breakpoint
CREATE TRIGGER ledger_capture_debts_update AFTER UPDATE OF amount_owed,housemate_id,bill_id ON debts
BEGIN
 INSERT INTO ledger_events(kind,source_id,payload) VALUES ('charge', NEW.id, json_object('id',NEW.id,'housemateId',NEW.housemate_id,'billId',NEW.bill_id,'amount',NEW.amount_owed,'effectiveAt',NEW.created_at,'dueAt',(SELECT due_date FROM bills WHERE id=NEW.bill_id),'description',coalesce((SELECT biller_name FROM bills WHERE id=NEW.bill_id), 'Deleted bill')));
END;
--> statement-breakpoint
CREATE TRIGGER ledger_capture_debts_delete AFTER DELETE ON debts
BEGIN
 INSERT INTO ledger_events(kind,source_id,payload) VALUES ('charge', OLD.id, json_object('id',OLD.id,'housemateId',OLD.housemate_id,'billId',OLD.bill_id,'amount',0,'effectiveAt',OLD.created_at,'dueAt',(SELECT due_date FROM bills WHERE id=OLD.bill_id),'description',coalesce((SELECT biller_name FROM bills WHERE id=OLD.bill_id), 'Deleted bill')));
END;
--> statement-breakpoint
INSERT INTO ledger_events(kind,source_id,payload) SELECT 'charge',src.id,json_object('id',src.id,'housemateId',src.housemate_id,'billId',src.bill_id,'amount',src.amount_owed,'effectiveAt',src.created_at,'dueAt',(SELECT due_date FROM bills WHERE id=src.bill_id),'description',coalesce((SELECT biller_name FROM bills WHERE id=src.bill_id), 'Deleted bill')) FROM debts src ORDER BY src.created_at,src.id;
--> statement-breakpoint
CREATE TRIGGER ledger_capture_payment_transactions_insert AFTER INSERT ON payment_transactions
BEGIN
 INSERT INTO ledger_events(kind,source_id,payload) VALUES ('payment', NEW.id, json_object('id',NEW.id,'transactionId',NEW.transaction_id,'housemateId',NEW.housemate_id,'amount',NEW.amount,'status',NEW.status,'source',NEW.source,'description',NEW.description,'rawData',NEW.raw_data,'effectiveAt',coalesce(NEW.settled_at,NEW.up_created_at,NEW.created_at),'createdAt',NEW.created_at,'debtIds',NEW.matched_debt_ids,'deleted',0));
END;
--> statement-breakpoint
CREATE TRIGGER ledger_capture_payment_transactions_update AFTER UPDATE OF amount,status,housemate_id,source,settled_at,up_created_at,matched_debt_ids ON payment_transactions
BEGIN
 INSERT INTO ledger_events(kind,source_id,payload) VALUES ('payment', NEW.id, json_object('id',NEW.id,'transactionId',NEW.transaction_id,'housemateId',NEW.housemate_id,'amount',NEW.amount,'status',NEW.status,'source',NEW.source,'description',NEW.description,'rawData',NEW.raw_data,'effectiveAt',coalesce(NEW.settled_at,NEW.up_created_at,NEW.created_at),'createdAt',NEW.created_at,'debtIds',NEW.matched_debt_ids,'deleted',0));
END;
--> statement-breakpoint
CREATE TRIGGER ledger_capture_payment_transactions_delete AFTER DELETE ON payment_transactions
BEGIN
 INSERT INTO ledger_events(kind,source_id,payload) VALUES ('payment', OLD.id, json_object('id',OLD.id,'transactionId',OLD.transaction_id,'housemateId',OLD.housemate_id,'amount',0,'status',OLD.status,'source',OLD.source,'description',OLD.description,'rawData',OLD.raw_data,'effectiveAt',coalesce(OLD.settled_at,OLD.up_created_at,OLD.created_at),'createdAt',OLD.created_at,'debtIds',OLD.matched_debt_ids,'deleted',1));
END;
--> statement-breakpoint
INSERT INTO ledger_events(kind,source_id,payload) SELECT 'payment',src.id,json_object('id',src.id,'transactionId',src.transaction_id,'housemateId',src.housemate_id,'amount',src.amount,'status',src.status,'source',src.source,'description',src.description,'rawData',src.raw_data,'effectiveAt',coalesce(src.settled_at,src.up_created_at,src.created_at),'createdAt',src.created_at,'debtIds',src.matched_debt_ids,'deleted',0) FROM payment_transactions src ORDER BY src.created_at,src.id;
--> statement-breakpoint
CREATE TRIGGER ledger_capture_bill_update AFTER UPDATE OF due_date,biller_name ON bills
BEGIN
 INSERT INTO ledger_events(kind,source_id,payload) SELECT 'charge',src.id,json_object('id',src.id,'housemateId',src.housemate_id,'billId',src.bill_id,'amount',src.amount_owed,'effectiveAt',src.created_at,'dueAt',(SELECT due_date FROM bills WHERE id=src.bill_id),'description',coalesce((SELECT biller_name FROM bills WHERE id=src.bill_id), 'Deleted bill')) FROM debts src WHERE src.bill_id=NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER ledger_entries_no_update BEFORE UPDATE ON ledger_entries BEGIN SELECT RAISE(ABORT, 'Ledger entries are immutable; post a reversal'); END;
--> statement-breakpoint
CREATE TRIGGER ledger_entries_no_delete BEFORE DELETE ON ledger_entries BEGIN SELECT RAISE(ABORT, 'Ledger entries are immutable; post a reversal'); END;
