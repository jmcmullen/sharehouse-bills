# Payments

How money moves through Sharehouse Bills: what is stored, what is derived, and
how a bank transaction becomes a receipt.

## Goal

One representation of money. A bill share is owed; a receipt is money in; an
allocation says which receipt paid which share. Everything else (paid,
remaining, credit, owed, overdue, balance, statement, bill status, settled date)
is derived by one module. Nothing is stored twice and nothing is synced.

Nothing is credited or allocated automatically. Automation classifies bank
activity and suggests which bills a payment covers; every receipt is an admin
decision.

## Schema

All money is integer cents. There are no tolerances. Tables live in
`src/api/db/schema/` (`bills.ts`, `debts.ts`, `payments.ts`).

```
bills              id, biller_name, provider, bill_type, total_cents, due_date,
                   statement_date, charge_due_date, bill_period_start,
                   bill_period_end, account_number, reference_number,
                   source_filename, parse_method, parse_confidence,
                   source_fingerprint, pdf_sha256, pdf_url, stack_group,
                   recurring_bill_id, created_at, updated_at

debts              id, bill_id, housemate_id, amount_cents, created_at,
                   updated_at
                   One row per housemate share of a bill.

bank_transactions  id, account_id, amount_cents, currency, bank_status,
                   description, message, raw_text, effective_at, raw_data,
                   housemate_id, decision, reason, review_group, decided_at,
                   imported_at, updated_at
                   decision: 'review' | 'confirmed' | 'excluded' | 'archived'
                   decided_at: null = automatic classification; set = admin
                   decision that re-ingest preserves.
                   review_group: 'unclear' | 'shared' | 'outgoing' (the queue
                   derives 'suggested' at read time).
                   updated_at doubles as the revision a decision must match.

receipts           id, housemate_id, amount_cents, received_at, kind,
                   bank_transaction_id, note, recorded_at, voided_at,
                   void_reason
                   kind: 'bank' | 'cash'
                   amount_cents > 0 is money in; < 0 is a refund sent out.
                   A shared bank transfer is one receipt per housemate with the
                   same bank_transaction_id. Receipts are never deleted; they
                   are voided with a reason.

allocations        receipt_id, debt_id, amount_cents, PK(receipt_id, debt_id)
                   Deleting a debt cascades to its allocations.

allocation_history id, receipt_id, debt_id, amount_cents, recorded_at
                   Append only. Negative rows record releases. receipt_id has
                   no foreign key so history for voided or migrated money
                   survives.

bill_reviews       bill_id, reviewed_at
                   An admin's tick that a bill's payments look right.
```

## Derivation rules

One module owns these: `src/api/services/account/`. Pure functions are in
`compute.ts`, the account and bill shapes in `account.ts`, the statement
timeline in `statement.ts`, and SQL loading in `account.server.ts`
(`loadAccount`, `loadAccounts`, `loadBill`, `loadBills`,
`loadVoidedReceipts`). Pages, messages, OG cards, assistant tools and server
functions read through it.

- **share.paidCents** = sum of allocations to the share from non-void receipts.
- **share.remainingCents** = amount_cents - paidCents, never negative.
- **share.settledAt** = latest received_at among the receipts allocated to it,
  only when remainingCents = 0.
- **bill.status** = `paid` when every non-owner share has remainingCents = 0,
  `partially_paid` when some non-owner share has money allocated, otherwise
  `pending`. **bill.settledAt** is the latest non-owner share settledAt once
  the bill is paid.
- **housemate.creditCents** = sum of non-void receipts - sum of their
  allocations.
- **cover** = creditCents applied to open shares oldest due first
  (`coverShares`). Each share gets `coveredCents` and `leftCents`. Owing,
  overdue, the pay page, the statement and the overdue digest all use the
  covered figures.
- **housemate.owesCents** = sum of remainingCents - creditCents, floored at 0.
- **housemate.overdueCents** = sum of leftCents on shares due before today in
  Australia/Sydney.
- **housemate.balanceCents** = sum of debts.amount_cents - sum of non-void
  receipts. Only the admin statement shows it.
- **statement** = shares and receipts on one timeline grouped by Sydney month,
  newest first. The housemate statement shows money received only; the admin
  statement adds refunds and a running balance, and shows voided receipts only
  when corrections are included.
- **bill-paid notification** is queued inside the allocation write that makes a
  bill paid (event key `bill-paid:<billId>`, insert or ignore).

## Bank transaction lifecycle

Code: `src/api/services/payments/`. Server functions:
`src/functions/ledger.ts` (review and accounts), `src/functions/bills.ts`
(cash, delete), `src/functions/bill-verification.ts` (bill review ticks).

1. **Ingest.** The Up webhook (`POST /api/hooks/up`, `bank-events.server.ts`)
   and the history import (`bun ledger --import-up`, `up-import.ts`) upsert
   `bank_transactions` through `bank-ingest.ts`. While `decided_at` is null the
   row is reclassified on every ingest:
   - own-account transfer, bank interest, merchant refund: `excluded`
   - before the first recorded bill: `archived`
   - several housemates named in the message: `review`, group `shared`
   - one identified housemate: `review`
   - anything else: `excluded`

   After a webhook ingest, a `review` row with money in and an identified
   housemate (or several named) queues the owner's `payment_arrived` message,
   once per transaction. The history import does not send it.
2. **Decide** (`decisions.ts`). Each action is one write transaction, checks
   the row's revision, and sets `decided_at`. Only settled external AUD
   transactions can be posted; archived rows need a note.
   - **confirm**: one bank receipt for the chosen housemate plus the chosen
     allocations. Empty allocations keep the money as credit. Queues the
     housemate's `payment_receipt` message.
   - **split**: one receipt per housemate, amounts summing to the transfer, no
     allocations. Each housemate's money is held as credit until allocated.
   - **refund** (money out): a negative receipt with a required note.
   - **exclude**: voids any receipts for the transaction with the reason.
   - **batch**: up to ten rows at once, either exclude or confirm a row whose
     server-side suggestion is an exact single-bill match.

   Suggestions (`suggestions.ts`) are advisory: oldest open share first, exact
   amount, then an exact combination, then a partial. Rent-only references only
   ever suggest rent bills.
3. **Re-ingest.** If a confirmed row's amount, currency or bank status changes,
   or the bank deletes it, its receipts are voided with the reason and the row
   goes back to `review` with `decided_at` cleared. Otherwise only the bank
   columns update.
4. **Reallocate.** The Accounts page replaces a receipt's allocations
   (`allocateReceipt`). The first allocation message is a receipt; later
   changes queue a `payment_correction` only when the allocations differ from
   the last message.
5. **Record cash.** The Bills page inserts a cash receipt and allocates it to
   one share, up to that share's remaining amount, and queues a receipt
   message. It is the only manual way money enters.
6. **Delete a bill.** Its allocations are released back to credit (recorded in
   history) in the same transaction as the delete.

## Running migrations

Migrations live in `src/api/db/migrations` and run with `bun db:migrate`.
Rehearse every migration that touches money on a copy of the live database
before running it live:

```bash
# 1. Back up the live database
turso db shell <db> .dump > backup.sql

# 2. Rehearse locally
sqlite3 local.db < backup.sql
DATABASE_URL=file:local.db bun db:migrate

# 3. Run live, then deploy
bun db:migrate
```

Migration 0023 (receipts) has a verification script. Run `snapshot` against
the database before the migration and `check` after it; `check` recomputes
balances, credit and per-share paid cents through the account module and exits
1 on any difference.

```bash
bun run src/api/scripts/verify-receipts-migration.ts snapshot before.json
bun db:migrate
bun run src/api/scripts/verify-receipts-migration.ts check before.json
```

`bun ledger --report report.json` writes each housemate's balance, credit and
amount owed plus the open review queue, for a quick check after any migration.
