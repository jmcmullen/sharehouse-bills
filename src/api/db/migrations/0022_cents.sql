DROP TRIGGER `ledger_capture_debts_insert`;--> statement-breakpoint
DROP TRIGGER `ledger_capture_debts_update`;--> statement-breakpoint
DROP TRIGGER `ledger_capture_debts_delete`;--> statement-breakpoint
DROP TRIGGER `ledger_capture_bill_update`;--> statement-breakpoint
ALTER TABLE `bills` ADD `total_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `bills` SET `total_cents`=CAST(round(`total_amount`*100) AS integer);--> statement-breakpoint
ALTER TABLE `bills` DROP COLUMN `total_amount`;--> statement-breakpoint
ALTER TABLE `bills` DROP COLUMN `status`;--> statement-breakpoint
ALTER TABLE `debts` ADD `amount_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `debts` SET `amount_cents`=CAST(round(`amount_owed`*100) AS integer);--> statement-breakpoint
-- Shares paid before the ledger existed keep their paid state: the paid amount
-- no allocation explains becomes a migrated cash receipt allocated to the share.
-- Allocations are inserted last so every statement sees the same difference.
INSERT INTO ledger_sources(source_key,entry_id,snapshot) SELECT 'manual:cash-migrated-'||d.id,'manual:cash-migrated-'||d.id,json_object('housemateId',d.housemate_id,'amountCents',-(CAST(round(d.amount_paid*100) AS integer)-coalesce((SELECT sum(a.amount_cents) FROM ledger_bill_allocations a WHERE a.debt_id=d.id),0)),'kind','payment','description','Recorded as paid before the ledger','billId',NULL,'effectiveAt',coalesce(d.paid_at,d.updated_at,d.created_at),'dueAt',NULL) FROM debts d WHERE CAST(round(d.amount_paid*100) AS integer) > coalesce((SELECT sum(a.amount_cents) FROM ledger_bill_allocations a WHERE a.debt_id=d.id),0);--> statement-breakpoint
INSERT INTO ledger_entries(id,housemate_id,source_key,kind,amount_cents,description,bill_id,effective_at,due_at,recorded_at,reverses_entry_id) SELECT 'manual:cash-migrated-'||d.id,d.housemate_id,'manual:cash-migrated-'||d.id,'payment',-(CAST(round(d.amount_paid*100) AS integer)-coalesce((SELECT sum(a.amount_cents) FROM ledger_bill_allocations a WHERE a.debt_id=d.id),0)),'Recorded as paid before the ledger',NULL,coalesce(d.paid_at,d.updated_at,d.created_at),NULL,unixepoch(),NULL FROM debts d WHERE CAST(round(d.amount_paid*100) AS integer) > coalesce((SELECT sum(a.amount_cents) FROM ledger_bill_allocations a WHERE a.debt_id=d.id),0);--> statement-breakpoint
INSERT INTO ledger_allocation_reviews(source_key,reviewed_at) SELECT 'manual:cash-migrated-'||d.id,unixepoch() FROM debts d WHERE CAST(round(d.amount_paid*100) AS integer) > coalesce((SELECT sum(a.amount_cents) FROM ledger_bill_allocations a WHERE a.debt_id=d.id),0);--> statement-breakpoint
INSERT INTO ledger_allocation_history(source_key,debt_id,amount_cents,origin) SELECT 'manual:cash-migrated-'||d.id,d.id,(CAST(round(d.amount_paid*100) AS integer)-coalesce((SELECT sum(a.amount_cents) FROM ledger_bill_allocations a WHERE a.debt_id=d.id),0)),'review' FROM debts d WHERE CAST(round(d.amount_paid*100) AS integer) > coalesce((SELECT sum(a.amount_cents) FROM ledger_bill_allocations a WHERE a.debt_id=d.id),0);--> statement-breakpoint
INSERT INTO ledger_bill_allocations(source_key,debt_id,amount_cents,origin) SELECT 'manual:cash-migrated-'||d.id,d.id,(CAST(round(d.amount_paid*100) AS integer)-coalesce((SELECT sum(a.amount_cents) FROM ledger_bill_allocations a WHERE a.debt_id=d.id),0)),'review' FROM debts d WHERE CAST(round(d.amount_paid*100) AS integer) > coalesce((SELECT sum(a.amount_cents) FROM ledger_bill_allocations a WHERE a.debt_id=d.id),0);--> statement-breakpoint
ALTER TABLE `debts` DROP COLUMN `amount_owed`;--> statement-breakpoint
ALTER TABLE `debts` DROP COLUMN `amount_paid`;--> statement-breakpoint
ALTER TABLE `debts` DROP COLUMN `is_paid`;--> statement-breakpoint
ALTER TABLE `debts` DROP COLUMN `paid_at`;--> statement-breakpoint
ALTER TABLE `recurringBills` ADD `totalCents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `recurringBills` SET `totalCents`=CAST(round(`totalAmount`*100) AS integer);--> statement-breakpoint
ALTER TABLE `recurringBills` DROP COLUMN `totalAmount`;--> statement-breakpoint
ALTER TABLE `recurringBillAssignments` ADD `customCents` integer;--> statement-breakpoint
UPDATE `recurringBillAssignments` SET `customCents`=CAST(round(`customAmount`*100) AS integer) WHERE `customAmount` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `recurringBillAssignments` DROP COLUMN `customAmount`;--> statement-breakpoint
UPDATE ledger_events SET payload=json_set(json_remove(payload,'$.amount'),'$.amountCents',CAST(round(json_extract(payload,'$.amount')*100) AS integer)) WHERE kind='charge' AND processed_at IS NULL;--> statement-breakpoint
UPDATE ledger_events SET processed_at=unixepoch() WHERE kind='paid_state' AND processed_at IS NULL;--> statement-breakpoint
CREATE TRIGGER ledger_capture_debts_insert AFTER INSERT ON debts
BEGIN
 INSERT INTO ledger_events(kind,source_id,payload) VALUES ('charge', NEW.id, json_object('id',NEW.id,'housemateId',NEW.housemate_id,'billId',NEW.bill_id,'amountCents',NEW.amount_cents,'effectiveAt',NEW.created_at,'dueAt',(SELECT due_date FROM bills WHERE id=NEW.bill_id),'description',coalesce((SELECT biller_name FROM bills WHERE id=NEW.bill_id), 'Deleted bill')));
END;
--> statement-breakpoint
CREATE TRIGGER ledger_capture_debts_update AFTER UPDATE OF amount_cents,housemate_id,bill_id ON debts
BEGIN
 INSERT INTO ledger_events(kind,source_id,payload) VALUES ('charge', NEW.id, json_object('id',NEW.id,'housemateId',NEW.housemate_id,'billId',NEW.bill_id,'amountCents',NEW.amount_cents,'effectiveAt',NEW.created_at,'dueAt',(SELECT due_date FROM bills WHERE id=NEW.bill_id),'description',coalesce((SELECT biller_name FROM bills WHERE id=NEW.bill_id), 'Deleted bill')));
END;
--> statement-breakpoint
CREATE TRIGGER ledger_capture_debts_delete AFTER DELETE ON debts
BEGIN
 INSERT INTO ledger_events(kind,source_id,payload) VALUES ('charge', OLD.id, json_object('id',OLD.id,'housemateId',OLD.housemate_id,'billId',OLD.bill_id,'amountCents',0,'effectiveAt',OLD.created_at,'dueAt',(SELECT due_date FROM bills WHERE id=OLD.bill_id),'description',coalesce((SELECT biller_name FROM bills WHERE id=OLD.bill_id), 'Deleted bill')));
END;
--> statement-breakpoint
CREATE TRIGGER ledger_capture_bill_update AFTER UPDATE OF due_date,biller_name ON bills
BEGIN
 INSERT INTO ledger_events(kind,source_id,payload) SELECT 'charge',src.id,json_object('id',src.id,'housemateId',src.housemate_id,'billId',src.bill_id,'amountCents',src.amount_cents,'effectiveAt',src.created_at,'dueAt',(SELECT due_date FROM bills WHERE id=src.bill_id),'description',coalesce((SELECT biller_name FROM bills WHERE id=src.bill_id), 'Deleted bill')) FROM debts src WHERE src.bill_id=NEW.id;
END;
