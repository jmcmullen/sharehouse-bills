import type { Client, Row, Transaction } from "@libsql/client";
import { z } from "zod";
import {
	type AccountStatement,
	type BankTransaction,
	type LedgerHousemate,
	type LedgerSource,
	type StatementEntry,
	bankTransactionSchema,
	calculateStatement,
	hasHouseholdReference,
	identifyHousemate,
	sourceSchema,
	toCents,
} from "./model";

type Executor = Pick<Client, "execute">;
const nowSeconds = (): number => Math.floor(Date.now() / 1000);

export async function applySource(
	tx: Executor,
	key: string,
	input: LedgerSource | null,
): Promise<void> {
	const source = input ? sourceSchema.parse(input) : null;
	const previous = (
		await tx.execute({
			sql: "SELECT entry_id,snapshot FROM ledger_sources WHERE source_key=?",
			args: [key],
		})
	).rows[0];
	const snapshot = JSON.stringify(source);
	if (previous?.snapshot === snapshot) return;
	if (previous?.entry_id) {
		const old = sourceSchema.parse(JSON.parse(String(previous.snapshot)));
		await insertEntry(
			tx,
			key,
			{ ...old, amountCents: -old.amountCents },
			String(previous.entry_id),
		);
	}
	const entryId =
		source && source.amountCents !== 0
			? await insertEntry(tx, key, source, null)
			: null;
	await tx.execute({
		sql: "INSERT INTO ledger_sources(source_key,entry_id,snapshot) VALUES (?,?,?) ON CONFLICT(source_key) DO UPDATE SET entry_id=excluded.entry_id,snapshot=excluded.snapshot",
		args: [key, entryId, snapshot],
	});
}

async function insertEntry(
	tx: Executor,
	key: string,
	source: LedgerSource,
	reversal: string | null,
): Promise<string> {
	const id = crypto.randomUUID();
	await tx.execute({
		sql: "INSERT INTO ledger_entries(id,housemate_id,source_key,kind,amount_cents,description,bill_id,effective_at,due_at,recorded_at,reverses_entry_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
		args: [
			id,
			source.housemateId,
			key,
			source.kind,
			source.amountCents,
			source.description,
			source.billId,
			source.effectiveAt,
			source.dueAt,
			nowSeconds(),
			reversal,
		],
	});
	return id;
}

async function loadHousemates(tx: Executor): Promise<LedgerHousemate[]> {
	return (
		await tx.execute("SELECT id,name,bank_alias,is_owner FROM housemates")
	).rows.map((row) => ({
		id: String(row.id),
		name: String(row.name),
		bankAlias: row.bank_alias === null ? null : String(row.bank_alias),
		isOwner: Boolean(row.is_owner),
	}));
}

export async function ingestBankTransaction(
	tx: Executor,
	input: unknown,
): Promise<void> {
	const transaction = bankTransactionSchema.parse(input);
	const attributes = transaction.attributes;
	const existing = (
		await tx.execute({
			sql: "SELECT * FROM ledger_bank_transactions WHERE id=?",
			args: [transaction.id],
		})
	).rows[0];
	const effectiveAt = Math.floor(
		Date.parse(attributes.settledAt ?? attributes.createdAt) / 1000,
	);
	await tx.execute({
		sql: `INSERT INTO ledger_bank_transactions(id,account_id,amount_cents,currency,bank_status,description,message,raw_text,effective_at,raw_data,imported_at,updated_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET account_id=excluded.account_id,amount_cents=excluded.amount_cents,currency=excluded.currency,bank_status=excluded.bank_status,description=excluded.description,message=excluded.message,raw_text=excluded.raw_text,effective_at=excluded.effective_at,raw_data=excluded.raw_data,updated_at=max(ledger_bank_transactions.updated_at+1,excluded.updated_at)`,
		args: [
			transaction.id,
			transaction.relationships?.account.data.id ?? null,
			attributes.amount.valueInBaseUnits,
			attributes.amount.currencyCode,
			attributes.status,
			attributes.description,
			attributes.message ?? "",
			attributes.rawText ?? "",
			effectiveAt,
			JSON.stringify(transaction),
			nowSeconds(),
			nowSeconds(),
		],
	});
	if (existing && existing.decision_origin === "review") {
		await preserveReviewedDecision(tx, transaction, existing);
		return;
	}
	const legacy = (
		await tx.execute({
			sql: "SELECT housemate_id,status,source FROM payment_transactions WHERE transaction_id=?",
			args: [transaction.id],
		})
	).rows[0];
	if (
		legacy?.status === "matched" &&
		legacy.housemate_id &&
		legacy.source !== "manual_admin" &&
		hasHouseholdReference(transaction)
	) {
		await setBankDecision(
			tx,
			transaction.id,
			"credit",
			String(legacy.housemate_id),
			"legacy",
			"Migrated matched bank receipt",
			null,
		);
		await postBankDecision(tx, transaction, String(legacy.housemate_id));
		return;
	}
	await classifyBankTransaction(tx, transaction, legacy, effectiveAt);
}

async function classifyBankTransaction(
	tx: Executor,
	transaction: BankTransaction,
	legacy: Row | undefined,
	effectiveAt: number,
): Promise<void> {
	const attributes = transaction.attributes;
	const housemates = await loadHousemates(tx);
	const housemate =
		legacy?.status === "matched" && legacy.housemate_id
			? (housemates.find(
					(item) => item.id === legacy.housemate_id && !item.isOwner,
				) ?? null)
			: identifyHousemate(transaction, housemates);
	const start = Number(
		(await tx.execute("SELECT min(created_at) AS start FROM bills")).rows[0]
			?.start ?? nowSeconds(),
	);
	const duplicate = housemate
		? (
				await tx.execute({
					sql: "SELECT source_key FROM ledger_sources WHERE source_key LIKE 'manual:%' AND json_extract(snapshot,'$.housemateId')=? AND json_extract(snapshot,'$.amountCents')=? AND abs(json_extract(snapshot,'$.effectiveAt')-?)<=1209600 LIMIT 1",
					args: [
						housemate.id,
						-attributes.amount.valueInBaseUnits,
						effectiveAt,
					],
				})
			).rows[0]
		: null;
	const eligible =
		housemate &&
		attributes.amount.valueInBaseUnits > 0 &&
		isSettledExternalAud(transaction);
	const credit =
		eligible &&
		effectiveAt >= start &&
		hasHouseholdReference(transaction) &&
		!duplicate;
	const unrelated = !housemate && attributes.amount.valueInBaseUnits <= 0;
	const reason = automaticDecisionReason(
		duplicate,
		effectiveAt < start,
		Boolean(housemate),
		Boolean(eligible),
		hasHouseholdReference(transaction),
	);
	await setBankDecision(
		tx,
		transaction.id,
		credit ? "credit" : unrelated ? "exclude" : "review",
		housemate?.id ?? null,
		"automatic",
		reason,
		null,
	);
	await applySource(
		tx,
		`bank:${transaction.id}`,
		credit ? bankSource(transaction, housemate.id) : null,
	);
}

function automaticDecisionReason(
	duplicate: Row | null | undefined,
	beforeHistory: boolean,
	identified: boolean,
	eligible: boolean,
	referenced: boolean,
): string {
	if (duplicate)
		return `Possible existing manual payment: ${duplicate.source_key}`;
	if (beforeHistory)
		return "Before the recorded bill history; verify historical charges before crediting";
	if (!identified) return "Housemate not identified";
	if (!eligible)
		return "Review currency, settlement status, transfer or refund";
	if (!referenced)
		return 'Missing "Bills" or "Rent" in the bank reference or description; approval required';
	return "Identified housemate and household reference; no exact bill match required";
}

async function preserveReviewedDecision(
	tx: Executor,
	transaction: BankTransaction,
	existing: Row,
): Promise<void> {
	const attributes = transaction.attributes;
	if (existing.decision === "linked") {
		const linked = (
			await tx.execute({
				sql: "SELECT snapshot FROM ledger_sources WHERE source_key=?",
				args: [existing.linked_source_key],
			})
		).rows[0];
		const source = linked
			? sourceSchema.nullable().parse(JSON.parse(String(linked.snapshot)))
			: null;
		if (
			!source ||
			source.housemateId !== existing.housemate_id ||
			source.amountCents !== -attributes.amount.valueInBaseUnits ||
			attributes.status !== "SETTLED" ||
			attributes.amount.currencyCode !== "AUD"
		) {
			await setBankDecision(
				tx,
				transaction.id,
				"review",
				existing.housemate_id === null ? null : String(existing.housemate_id),
				"review",
				"Linked manual payment or bank receipt changed; reconcile again",
				null,
			);
		}
	}
	if (existing.decision === "credit") {
		await postBankDecision(tx, transaction, String(existing.housemate_id));
	}
	return;
}

function bankSource(
	transaction: BankTransaction,
	housemateId: string,
): LedgerSource {
	return {
		housemateId,
		amountCents: -transaction.attributes.amount.valueInBaseUnits,
		kind:
			transaction.attributes.amount.valueInBaseUnits >= 0
				? "payment"
				: "refund",
		description: [
			transaction.attributes.description,
			transaction.attributes.message,
		]
			.filter(Boolean)
			.join(" · "),
		billId: null,
		effectiveAt: Math.floor(
			Date.parse(
				transaction.attributes.settledAt ?? transaction.attributes.createdAt,
			) / 1000,
		),
		dueAt: null,
	};
}

function isSettledExternalAud(transaction: BankTransaction): boolean {
	return (
		transaction.attributes.status === "SETTLED" &&
		transaction.attributes.amount.currencyCode === "AUD" &&
		!transaction.relationships?.transferAccount?.data
	);
}

async function postBankDecision(
	tx: Executor,
	transaction: BankTransaction,
	housemateId: string,
): Promise<void> {
	if (!isSettledExternalAud(transaction)) {
		await applySource(tx, `bank:${transaction.id}`, null);
		await setBankDecision(
			tx,
			transaction.id,
			"review",
			housemateId,
			"review",
			"Previously credited bank transaction changed; recheck settlement and currency",
			null,
		);
		return;
	}
	await applySource(
		tx,
		`bank:${transaction.id}`,
		bankSource(transaction, housemateId),
	);
}

async function setBankDecision(
	tx: Executor,
	id: string,
	decision: string,
	housemateId: string | null,
	origin: string,
	reason: string,
	link: string | null,
): Promise<void> {
	await tx.execute({
		sql: "UPDATE ledger_bank_transactions SET decision=?,housemate_id=?,decision_origin=?,reason=?,linked_source_key=?,updated_at=max(updated_at+1,?) WHERE id=?",
		args: [decision, housemateId, origin, reason, link, nowSeconds(), id],
	});
}

const chargeEventSchema = z.object({
	id: z.string(),
	housemateId: z.string(),
	billId: z.string(),
	amount: z.number(),
	effectiveAt: z.number(),
	dueAt: z.number().nullable(),
	description: z.string(),
});
const paymentEventSchema = z.object({
	id: z.string(),
	transactionId: z.string(),
	housemateId: z.string().nullable(),
	amount: z.number(),
	status: z.string(),
	source: z.string(),
	description: z.string(),
	rawData: z.string().nullable(),
	effectiveAt: z.number(),
	createdAt: z.number(),
	debtIds: z.string().nullable(),
	deleted: z.number(),
});

async function processEvent(
	tx: Executor,
	kind: string,
	payload: string,
): Promise<void> {
	if (kind === "bank") {
		await ingestBankTransaction(tx, JSON.parse(payload));
		return;
	}
	if (kind === "charge") {
		const event = chargeEventSchema.parse(JSON.parse(payload));
		await applySource(
			tx,
			`charge:${event.id}`,
			event.amount === 0
				? null
				: {
						housemateId: event.housemateId,
						amountCents: toCents(event.amount),
						kind: "charge",
						description: event.description,
						billId: event.billId,
						effectiveAt: event.effectiveAt,
						dueAt: event.dueAt,
					},
		);
		return;
	}
	const event = paymentEventSchema.parse(JSON.parse(payload));
	if (event.source === "manual_admin") {
		await applySource(
			tx,
			`manual:${event.transactionId}`,
			event.deleted || event.status !== "matched" || !event.housemateId
				? null
				: {
						housemateId: event.housemateId,
						amountCents: -toCents(event.amount),
						kind: event.amount >= 0 ? "payment" : "adjustment",
						description: event.description,
						billId: null,
						effectiveAt: event.effectiveAt,
						dueAt: null,
					},
		);
		await tx.execute({
			sql: "INSERT INTO ledger_events(kind,source_id,payload) SELECT 'bank',id,raw_data FROM ledger_bank_transactions WHERE (decision_origin='automatic' AND housemate_id=?) OR linked_source_key=?",
			args: [event.housemateId, `manual:${event.transactionId}`],
		});
		return;
	}
	if (event.rawData) {
		await ingestBankTransaction(tx, JSON.parse(event.rawData));
		return;
	}
	if (event.status === "matched" && event.housemateId) {
		throw new Error(
			`Bank receipt ${event.transactionId} has no bank payload; import its Up transaction before processing this event`,
		);
	}
}

export async function drainLedgerEvents(client: Client): Promise<number> {
	let processed = 0;
	while (true) {
		const count = await withWriteTransaction(client, async (tx) => {
			const events = (
				await tx.execute(
					"SELECT id,kind,payload FROM ledger_events WHERE processed_at IS NULL ORDER BY id LIMIT 1",
				)
			).rows;
			for (const event of events) {
				await processEvent(tx, String(event.kind), String(event.payload));
				await tx.execute({
					sql: "UPDATE ledger_events SET processed_at=? WHERE id=?",
					args: [nowSeconds(), event.id],
				});
			}
			return events.length;
		});
		processed += count;
		if (count === 0) return processed;
	}
}

export async function withWriteTransaction<T>(
	client: Client,
	operation: (tx: Transaction) => Promise<T>,
): Promise<T> {
	const tx = await client.transaction("write");
	try {
		const result = await operation(tx);
		await tx.commit();
		return result;
	} catch (error) {
		await tx.rollback();
		throw error;
	} finally {
		tx.close();
	}
}

export const reviewDecisionSchema = z.object({
	transactionId: z.string().min(1),
	action: z.enum(["credit", "exclude", "link"]),
	housemateId: z.string().min(1).optional(),
	manualSourceKey: z.string().min(1).optional(),
	reason: z.string().trim().min(5),
	expectedRevision: z.number().int().optional(),
});
type ReviewDecision = z.infer<typeof reviewDecisionSchema>;

export async function reviewBankTransaction(
	client: Client,
	input: ReviewDecision,
): Promise<void> {
	const decision = reviewDecisionSchema.parse(input);
	await withWriteTransaction(client, async (tx) => {
		const bank = (
			await tx.execute({
				sql: "SELECT * FROM ledger_bank_transactions WHERE id=?",
				args: [decision.transactionId],
			})
		).rows[0];
		if (!bank) throw new Error("Bank transaction not found");
		if (
			decision.expectedRevision !== undefined &&
			decision.expectedRevision !== Number(bank.updated_at)
		)
			throw new Error(
				"This payment changed since you opened it. Refresh and review it again.",
			);
		const transaction = bankTransactionSchema.parse(
			JSON.parse(String(bank.raw_data)),
		);
		if (decision.action === "exclude") {
			await applySource(tx, `bank:${transaction.id}`, null);
			await setBankDecision(
				tx,
				transaction.id,
				"exclude",
				bank.housemate_id === null ? null : String(bank.housemate_id),
				"review",
				decision.reason,
				null,
			);
			return;
		}
		if (bank.bank_status === "DELETED")
			throw new Error("Deleted bank transactions cannot be credited or linked");
		const housemate = (await loadHousemates(tx)).find(
			(h) => h.id === decision.housemateId && !h.isOwner,
		);
		if (!housemate) throw new Error("Select a non-owner housemate");
		if (!isSettledExternalAud(transaction))
			throw new Error("Only settled external AUD transactions can be posted");
		if (decision.action === "link") {
			await linkManualPayment(tx, transaction, decision, housemate.id);
			return;
		}
		await setBankDecision(
			tx,
			transaction.id,
			"credit",
			housemate.id,
			"review",
			decision.reason,
			null,
		);
		await postBankDecision(tx, transaction, housemate.id);
	});
}

async function linkManualPayment(
	tx: Executor,
	transaction: BankTransaction,
	decision: ReviewDecision,
	housemateId: string,
): Promise<void> {
	if (!decision.manualSourceKey?.startsWith("manual:"))
		throw new Error("Select an existing manual payment");
	const manual = (
		await tx.execute({
			sql: "SELECT snapshot FROM ledger_sources WHERE source_key=?",
			args: [decision.manualSourceKey],
		})
	).rows[0];
	const source = manual
		? sourceSchema.parse(JSON.parse(String(manual.snapshot)))
		: null;
	if (
		!source ||
		source.housemateId !== housemateId ||
		source.amountCents !== -transaction.attributes.amount.valueInBaseUnits ||
		source.kind !== "payment"
	)
		throw new Error(
			"Manual payment must belong to this housemate and equal the received amount",
		);
	await applySource(tx, `bank:${transaction.id}`, null);
	await setBankDecision(
		tx,
		transaction.id,
		"linked",
		housemateId,
		"review",
		decision.reason,
		decision.manualSourceKey,
	);
}

export async function getAccountStatement(
	client: Executor,
	housemateId: string,
	now = nowSeconds(),
): Promise<AccountStatement> {
	const rows = (
		await client.execute({
			sql: "SELECT * FROM ledger_entries WHERE housemate_id=? ORDER BY effective_at,recorded_at,id",
			args: [housemateId],
		})
	).rows;
	const entries: StatementEntry[] = rows.map((row) => ({
		id: String(row.id),
		sourceKey: String(row.source_key),
		recordedAt: Number(row.recorded_at),
		reversesEntryId:
			row.reverses_entry_id === null ? null : String(row.reverses_entry_id),
		...sourceSchema.parse({
			housemateId: row.housemate_id,
			amountCents: row.amount_cents,
			kind: row.kind,
			description: row.description,
			billId: row.bill_id,
			effectiveAt: row.effective_at,
			dueAt: row.due_at,
		}),
	}));
	return calculateStatement(entries, now);
}
