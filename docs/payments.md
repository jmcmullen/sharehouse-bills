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
  `pending`. **bill.paidCents** and **bill.remainingCents** sum non-owner
  shares only; the owner pays the bill up front and never owes it.
  **bill.settledAt** is the latest non-owner share settledAt once the bill is
  paid.
- **housemate.creditCents** = sum of non-void receipts - sum of their
  allocations.
- **cover** = creditCents applied to open shares oldest due first
  (`coverShares`). Each share gets `coveredCents` and `leftCents`. Owing,
  overdue, the pay page, the statement and the overdue digest all use the
  covered figures.
- **housemate.owesCents** = sum of remainingCents - creditCents floored at 0
  (the same held credit the cover applies), floored at 0. A refund larger than
  the credit held lowers the balance, not what is owed on bills.
- **housemate.overdueCents** = sum of leftCents on shares due before today in
  Australia/Sydney; **upcomingCents** is the same for shares due after today.
- **housemate.balanceCents** = sum of debts.amount_cents - sum of non-void
  receipts, signed. Only the admin statement shows it.
- Owner accounts are left out of the housemate balances.
- **statement** = shares and receipts on one timeline grouped by Sydney month,
  newest first. The housemate statement shows money received only; the admin
  statement adds refunds and a running balance, and shows voided receipts only
  when corrections are included.
- **bill-paid notification** is queued inside the allocation write that makes a
  bill paid (event key `bill-paid:<billId>`, insert or ignore). A release that
  makes the bill unpaid again deletes the message while it is still `pending`,
  so the payment that settles the bill again queues it again.

## Bank transaction lifecycle

Code: `src/api/services/payments/`. Server functions:
`src/functions/ledger.ts` (review, accounts and cash),
`src/functions/bills.ts` (delete), `src/functions/bill-verification.ts` (bill review ticks).

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
     housemate's `payment_receipt` message. Re-confirming a transaction whose
     single live receipt already has the same housemate and amount keeps that
     receipt and rewrites its allocations, so the housemate gets a
     `payment_correction` (or nothing when the allocations are unchanged),
     never a second receipt. A different housemate or amount voids the old
     receipt and inserts a new one.
   - **split**: one receipt per housemate, amounts summing to the transfer, no
     allocations. Each housemate's money is held as credit until allocated.
   - **refund** (money out): a negative receipt with a required note.
   - **exclude**: voids any receipts for the transaction with the reason.

   Voiding a receipt whose `payment_receipt` message was already queued queues
   a `payment_correction` with nothing allocated and `voided: true`, telling
   the housemate the money no longer counts. A receipt or correction message
   still pending for money voided since is not sent.
   - **batch**: up to ten rows at once, either exclude or confirm a row whose
     server-side suggestion is an exact single-bill match.

   Suggestions (`suggestions.ts`) are advisory: oldest open share first, exact
   amount, then an exact combination, then a partial. Rent-only references only
   ever suggest rent bills.
3. **Re-ingest.** If a confirmed row's amount, currency or bank status changes,
   or the bank deletes it, its receipts are voided with the reason and the row
   goes back to `review` for the same housemate. `decided_at` stays set, so a
   later ingest never reclassifies a row the admin assigned by hand. Otherwise
   only the bank columns update.
4. **Reallocate.** The Accounts page replaces a receipt's allocations
   (`allocateReceipt`). The form's revision hashes the stored shares, receipts
   and allocations only, so a form open across Sydney midnight still saves. The first allocation message is a receipt; later
   changes queue a `payment_correction` only when the allocations differ from
   the last message.
5. **Record cash** (`cash.ts`). From the Accounts page the admin enters one
   housemate's cash once: amount, date (not in the future) and note. The form
   proposes allocations with `fillOldestFirst` (oldest due first, undated
   last, part-paying the last share reached) and the admin can change them.
   One write transaction checks the account revision, inserts one cash
   receipt, writes its allocations (empty keeps the money as credit; the
   usual share, total and rent-only checks apply, with the note as the
   reference) and queues the housemate's `payment_receipt`, which reads "cash
   received". It is the only manual way money enters.
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

Migration 0022 (cents) keeps shares paid before the ledger paid. It first
allocates the housemate's own unallocated legacy payments to those shares,
oldest money against the oldest share, and mints a migrated cash receipt only
for what is still unexplained. Owner shares are skipped.

Migration 0023 (receipts) aborts if any bank event is still unprocessed. Take
the snapshot on the previous deployed commit (e4b6b89), where `bun ledger
--sync` exists to clear pending events. Migration 0023 has a verification
script. Run `snapshot` against
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
