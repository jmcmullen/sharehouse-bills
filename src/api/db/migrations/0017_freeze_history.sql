CREATE TABLE `ledger_bill_reviews` (
	`bill_id` text PRIMARY KEY NOT NULL,
	`reviewed_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO ledger_allocation_history(source_key,debt_id,amount_cents,origin)
SELECT source_key,debt_id,-amount_cents,'released' FROM ledger_bill_allocations WHERE origin='auto';
--> statement-breakpoint
DELETE FROM ledger_bill_allocations WHERE origin='auto';
--> statement-breakpoint
INSERT INTO ledger_allocation_reviews(source_key,reviewed_at)
SELECT DISTINCT source_key,unixepoch() FROM ledger_bill_allocations
WHERE origin='legacy' AND source_key NOT IN (SELECT source_key FROM ledger_allocation_reviews);
--> statement-breakpoint
INSERT INTO ledger_bill_reviews(bill_id,reviewed_at)
SELECT b.id,unixepoch() FROM bills b
WHERE EXISTS (SELECT 1 FROM debts d JOIN housemates h ON h.id=d.housemate_id WHERE d.bill_id=b.id AND h.is_owner=0)
AND NOT EXISTS (
	SELECT 1 FROM debts d JOIN housemates h ON h.id=d.housemate_id
	WHERE d.bill_id=b.id AND h.is_owner=0 AND (
		coalesce((SELECT sum(amount_cents) FROM ledger_bill_allocations a WHERE a.debt_id=d.id),0) < round(d.amount_owed*100)
		OR EXISTS (SELECT 1 FROM ledger_bill_allocations a WHERE a.debt_id=d.id AND a.origin NOT IN ('legacy','review'))
	)
);
--> statement-breakpoint
UPDATE ledger_events SET processed_at=unixepoch() WHERE kind='allocations' AND processed_at IS NULL;
--> statement-breakpoint
INSERT INTO ledger_events(kind,source_id,payload) VALUES('paid_state','freeze','{}');
