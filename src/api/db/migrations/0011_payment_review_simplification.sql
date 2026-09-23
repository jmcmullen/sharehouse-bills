CREATE TABLE `ledger_bank_allocations` (
	`transaction_id` text NOT NULL,
	`housemate_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	PRIMARY KEY(`transaction_id`, `housemate_id`)
);

--> statement-breakpoint
UPDATE housemates SET bank_alias=trim(coalesce(bank_alias,'') || ',Matt Blair,Matt', ',')
WHERE lower(name)='matthew blair' AND instr(lower(coalesce(bank_alias,'')), 'matt blair')=0;
--> statement-breakpoint
INSERT INTO ledger_events(kind,source_id,payload)
SELECT 'bank',id,raw_data FROM ledger_bank_transactions
WHERE decision='review' AND decision_origin='automatic' AND bank_status!='DELETED';
