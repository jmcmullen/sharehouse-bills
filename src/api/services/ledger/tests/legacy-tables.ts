// Minimal legacy app tables the ledger writes paid state into.
export const legacyTables = `CREATE TABLE housemates(id TEXT PRIMARY KEY,name TEXT,bank_alias TEXT,is_owner INTEGER);
CREATE TABLE bills(id TEXT PRIMARY KEY,biller_name TEXT,due_date INTEGER,created_at INTEGER,status TEXT DEFAULT 'pending',updated_at INTEGER,bill_type TEXT,stack_group TEXT);
CREATE TABLE debts(id TEXT PRIMARY KEY,housemate_id TEXT,bill_id TEXT,amount_owed REAL,amount_paid REAL DEFAULT 0,created_at INTEGER,is_paid INTEGER DEFAULT 0,paid_at INTEGER,updated_at INTEGER);
CREATE TABLE payment_transactions(id TEXT PRIMARY KEY,transaction_id TEXT UNIQUE,housemate_id TEXT,amount REAL,status TEXT,source TEXT,description TEXT,raw_data TEXT,settled_at INTEGER,up_created_at INTEGER,created_at INTEGER,matched_debt_ids TEXT,credit_amount REAL DEFAULT 0);
CREATE TABLE whatsapp_notifications(id TEXT PRIMARY KEY,event_key TEXT UNIQUE,event_type TEXT,status TEXT DEFAULT 'pending',bill_id TEXT,debt_id TEXT,housemate_id TEXT,payload TEXT,created_at INTEGER,updated_at INTEGER);`;
