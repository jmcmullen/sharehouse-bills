UPDATE ledger_bank_transactions SET review_group=CASE review_group
WHEN 'purpose' THEN 'unclear'
WHEN 'duplicate' THEN 'unclear'
WHEN 'assignment' THEN 'shared'
ELSE review_group END;
--> statement-breakpoint
UPDATE ledger_bank_transactions SET decision_origin='review',reason='Credited before explicit matching; recorded bill payments kept',updated_at=updated_at+1
WHERE decision='credit' AND decision_origin!='review' AND 'bank:'||id IN (SELECT source_key FROM ledger_allocation_reviews);
--> statement-breakpoint
INSERT INTO ledger_events(kind,source_id,payload)
SELECT 'bank',id,raw_data FROM ledger_bank_transactions
WHERE decision='credit' AND decision_origin!='review' AND bank_status!='DELETED';
