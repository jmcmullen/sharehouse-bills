import type { Client } from "@libsql/client";
import { ledgerMigrations, legacyTables, readMigration } from "./legacy-tables";

export const seedTime = 1780000000;
const t = seedTime;

function bank(
	id: string,
	amountCents: number,
	at: number,
	decision: string,
	origin: string,
	housemateId: string | null,
	link: string | null = null,
): string {
	const raw = JSON.stringify({
		id,
		attributes: {
			status: "SETTLED",
			description: "Bank sender",
			rawText: null,
			message: `Reference ${id}`,
			amount: { currencyCode: "AUD", valueInBaseUnits: amountCents },
			createdAt: new Date(at * 1000).toISOString(),
			settledAt: new Date(at * 1000).toISOString(),
		},
	});
	return `INSERT INTO ledger_bank_transactions(id,account_id,amount_cents,currency,bank_status,description,message,raw_text,effective_at,raw_data,housemate_id,decision,decision_origin,reason,linked_source_key,imported_at,updated_at,review_group) VALUES('${id}','spending',${amountCents},'AUD','SETTLED','Bank sender','Reference ${id}','',${at},'${raw}',${housemateId ? `'${housemateId}'` : "NULL"},'${decision}','${origin}','Seeded',${link ? `'${link}'` : "NULL"},${at},${at + 7},'unclear');`;
}

// A live journal source and its posting.
function post(
	key: string,
	housemateId: string,
	kind: string,
	amountCents: number,
	description: string,
	at: number,
): string {
	const entry = `e-${key}`;
	const snapshot = JSON.stringify({
		housemateId,
		amountCents,
		kind,
		description,
		billId: null,
		effectiveAt: at,
		dueAt: null,
	});
	return `INSERT INTO ledger_sources(source_key,entry_id,snapshot) VALUES('${key}','${entry}','${snapshot}');
INSERT INTO ledger_entries(id,housemate_id,source_key,kind,amount_cents,description,bill_id,effective_at,due_at,recorded_at,reverses_entry_id) VALUES('${entry}','${housemateId}','${key}','${kind}',${amountCents},'${description}',NULL,${at},NULL,${at + 5},NULL);`;
}

function allocate(key: string, debtId: string, amountCents: number): string {
	return `INSERT INTO ledger_bill_allocations(source_key,debt_id,amount_cents,origin) VALUES('${key}','${debtId}',${amountCents},'review');
INSERT INTO ledger_allocation_history(source_key,debt_id,amount_cents,origin,recorded_at) VALUES('${key}','${debtId}',${amountCents},'review',${t + 900});`;
}

// The live database as it stands before migration 0023: bank receipts, a
// split transfer, cash, legacy manual payments with and without bank evidence,
// a reversed posting, a refund, a share paid before the ledger existed,
// allocations, history and a reviewed bill.
export async function seedLegacyLedger(client: Client): Promise<void> {
	await client.executeMultiple(`${legacyTables}
		INSERT INTO housemates VALUES('oliver','Oliver Caprile',NULL,0),('sarah','Sarah O Dwyer',NULL,0),('jay','Jay McMullen',NULL,1);
		INSERT INTO bills(id,biller_name,total_amount,due_date,created_at,updated_at) VALUES('gas','Gas',150,${t},${t - 1000},${t - 1000}),('rent','Rent',100,${t + 86400},${t - 1000},${t - 1000});`);
	for (const name of ledgerMigrations.slice(0, -1))
		await client.executeMultiple(await readMigration(name));
	await client.execute(
		`INSERT INTO debts(id,housemate_id,bill_id,amount_owed,amount_paid,is_paid,paid_at,created_at,updated_at) VALUES('old-o','oliver','gas',50,50,1,${t - 500},${t - 900},${t - 900})`,
	);
	await client.executeMultiple(await readMigration("0022_cents"));
	const shares: Array<[string, string, string, number]> = [
		["gas-o", "oliver", "gas", 6000],
		["gas-s", "sarah", "gas", 3000],
		["gas-j", "jay", "gas", 1000],
		["rent-o", "oliver", "rent", 8000],
		["rent-s", "sarah", "rent", 2000],
	];
	await client.executeMultiple(
		shares
			.map(
				([id, housemateId, billId, cents]) =>
					`INSERT INTO debts(id,housemate_id,bill_id,amount_cents,created_at,updated_at) VALUES('${id}','${housemateId}','${billId}',${cents},${t - 900},${t - 900});`,
			)
			.join("\n"),
	);
	await client.executeMultiple(`
		${[...shares, ["old-o", "oliver", "gas", 5000] as const]
			.map(([id, housemateId, , cents]) =>
				post(`charge:${id}`, housemateId, "charge", cents, "Gas", t - 900),
			)
			.join("\n")}
		UPDATE ledger_events SET processed_at=${t};
		${bank("tx-a", 9000, t + 100, "credit", "review", "oliver")}
		${bank("tx-split", 7000, t + 200, "credit", "review", null)}
		${bank("tx-linked", 6000, t + 300, "linked", "review", "oliver", "manual:legacy-1")}
		${bank("tx-reversed", 1000, t + 400, "review", "review", "oliver")}
		${bank("tx-refund", -2500, t + 500, "credit", "review", "oliver")}
		${bank("tx-review", 3000, t + 600, "review", "automatic", "sarah")}
		${bank("tx-excluded", 500, t + 700, "exclude", "automatic", null)}
		${bank("tx-archived", 100, t - 5000, "archive", "automatic", "oliver")}
		${post("bank:tx-a", "oliver", "payment", -9000, "Bank sender · Reference tx-a", t + 100)}
		${post("bank:tx-split:oliver", "oliver", "payment", -4000, "Bank sender", t + 200)}
		${post("bank:tx-split:sarah", "sarah", "payment", -3000, "Bank sender", t + 200)}
		${post("manual:cash-c1", "oliver", "payment", -2000, "Cash received · At dinner", t + 150)}
		${post("manual:legacy-1", "oliver", "payment", -6000, "Manual rent", t + 50)}
		${post("manual:legacy-2", "sarah", "payment", -1500, "Old transfer", t + 60)}
		${post("manual:ledger-l1", "sarah", "payment", -500, "Rent top up", t + 70)}
		${post("bank:tx-refund", "oliver", "refund", 2500, "Bank sender · Refund", t + 500)}
		INSERT INTO ledger_bank_allocations(transaction_id,housemate_id,amount_cents) VALUES('tx-split','oliver',4000),('tx-split','sarah',3000);
		INSERT INTO ledger_payment_evidence(transaction_id,source_key,amount_cents) VALUES('tx-linked','manual:legacy-1',6000);
		INSERT INTO ledger_sources(source_key,entry_id,snapshot) VALUES('bank:tx-reversed',NULL,'null');
		INSERT INTO ledger_entries(id,housemate_id,source_key,kind,amount_cents,description,bill_id,effective_at,due_at,recorded_at,reverses_entry_id) VALUES('rev-1','oliver','bank:tx-reversed','payment',-1000,'Reversed',NULL,${t + 400},NULL,${t + 400},NULL),('rev-2','oliver','bank:tx-reversed','payment',1000,'Reversed',NULL,${t + 400},NULL,${t + 450},'rev-1');
		INSERT INTO ledger_allocation_history(source_key,debt_id,amount_cents,origin,recorded_at) VALUES('bank:tx-reversed','gas-o',1000,'review',${t + 400}),('bank:tx-reversed','gas-o',-1000,'released',${t + 450});
		${allocate("bank:tx-a", "gas-o", 6000)}
		${allocate("manual:cash-c1", "rent-o", 2000)}
		${allocate("manual:legacy-1", "rent-o", 6000)}
		${allocate("bank:tx-split:sarah", "gas-s", 3000)}
		${allocate("manual:legacy-2", "rent-s", 1500)}
		INSERT INTO ledger_bill_reviews(bill_id,reviewed_at) VALUES('gas',${t + 1000});`);
}
