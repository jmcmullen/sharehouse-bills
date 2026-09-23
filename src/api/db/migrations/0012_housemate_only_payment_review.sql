INSERT INTO ledger_events(kind,source_id,payload)
SELECT 'bank',id,raw_data FROM ledger_bank_transactions
WHERE decision='review' AND decision_origin='automatic'
AND housemate_id IS NULL AND bank_status!='DELETED';
