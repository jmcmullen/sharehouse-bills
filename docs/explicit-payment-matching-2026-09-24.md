# Explicit payment matching

Decided 24 September 2026.

## Decision

The ledger never allocates a payment to a bill on its own. Automation may suggest a match; only an admin decision records one. Every allocation from now on is an explicit action in the payment review or ledger UI, and the history recorded before this date is frozen as approved.

## Phase 1 changes

- `auto-allocation.ts` is deleted. Applying a source no longer fills open debts from available money; the only automatic step left is restoring the bill assignments a legacy manual payment already carried (`restoreLegacyAllocations`), and migration 0017 marks every such payment reviewed so that runs once and never again.
- The `allocations` ledger event kind is gone. `processEvent` throws on unknown kinds. A new `paid_state` event kind re-syncs the legacy `debts`/`bills` paid columns for every debt an allocation has ever touched.
- Write-through of paid state (`paid-state.ts`) is unchanged: allocations remain the single source of "paid".
- New table `ledger_bill_reviews(bill_id, reviewed_at)` records an admin ticking a bill as "looks right". The Bills page verification section shows a **Looks right** toggle per bill (reads **Approved** once ticked), defaults to the **Needs a look** filter, and counts approved versus needs-a-look bills.

## Migration 0017 `freeze_history`

1. Creates `ledger_bill_reviews`.
2. Reverses every `ledger_bill_allocations` row with origin `auto` into `ledger_allocation_history` (origin `released`) and deletes it.
3. Inserts a `ledger_allocation_reviews` row for every source that has a `legacy` allocation, so the legacy backfill never touches those payments again.
4. Pre-ticks a bill review for every bill with at least one non-owner share where every share is fully covered and every allocation on it has origin `legacy` or `review`.
5. Marks any pending `allocations` events processed and queues one `paid_state` event. The app processes it on the next sync (`bun run ledger --sync`, or opening a ledger page), which rewrites `amount_paid`/`is_paid`/`paid_at` and bill status for affected debts.

## Before applying

Take a full backup of the live database first. Step 2 removes allocations that were written by automation and the paid-state resync flips debts back to unpaid where only automatic allocations covered them. The allocation history table is immutable, so the reversal is auditable, but the backup is the only way to restore the pre-freeze state as a whole.

## Phase 3: arrivals, cash and what housemates see

- **Owner is told when money arrives.** `recordLedgerBankEvent` (the Up webhook path) enqueues a `payment_arrived` WhatsApp notification (`arrival-notifications.ts`, event key `payment-arrived:<transactionId>`) inside the ingest transaction whenever a positive transaction lands in `review` with a housemate, or names several housemates. The row is unique per transaction, so re-ingests and settlement updates never repeat it. `workflows/payment-arrived.ts` sends the message to the owner housemate: sender, amount, reference, date, the live suggestion ("Looks like Rent · 12 Sep, $420.00" or "No matching bill") and a link to `/payment-review?query=<transactionId>`. It is ignored if the transaction has been decided before it is sent.
- **Cash is the only manual payment.** "Mark paid" is gone. "Record cash" (`cash-receipt.ts`, `recordCashReceived`) takes an amount, date and note, writes a `manual:cash-<uuid>` payment source, allocates it to the chosen share with origin `review`, marks it reviewed and enqueues the housemate's receipt in one ledger transaction. `payment_transactions` is no longer written by the app.
- **Credit is named.** The daily overdue digest and the public pay page apply held credit to the oldest shares first (`bill-reminder-credit.ts`), skip shares it fully covers and say how much credit is already applied. See [private notifications](private-notifications-2026-09-24.md).
- **Statement leads with bills.** The housemate statement (now at `/pay/<token>/statement`, behind the pay link) lists each bill share with what covered it and when, alongside the money received. Suggestions and bank identifiers stay admin-only.

## Phase 2 changes

- Automatic crediting is gone. `classifyBankTransaction` gives every identified housemate receipt the decision `review`; unidentified senders are still excluded, own-account transfers, interest and merchant refunds still ignored, pre-history receipts still archived, and multi-beneficiary transfers still reviewed as a whole. `hasHouseholdReference` and the household word list are deleted; `isRentReference` remains only to keep rent money on rent bills.
- Suggestions are attached to review rows. `loadPaymentReview` loads each housemate's open shares once (`getAccountPayments`) and proposes allocations per row with `suggestBankReceipt`. Nothing is written until an admin acts.
- Review groups are now `suggested` (an exact or combination suggestion exists), `unclear`, `shared` and `outgoing`. Only the last three are stored in `review_group`; `suggested` is derived at read time because it depends on the bills open today. A possible manual duplicate is the `matchCandidate` flag on the row, not a group.
- `confirmReceipt` (`src/api/services/ledger/confirm-receipt.ts`, server function `confirmLedgerReceipt`) is the one explicit action: in a single transaction it credits the transfer to the housemate, replaces the receipt's allocations with origin `review`, records a `ledger_allocation_reviews` row and enqueues the housemate's WhatsApp receipt. Empty allocations are a deliberate "keep as credit" and produce a receipt whose `after` list is empty. Stale bank revisions, over-allocation and rent-to-utility allocations are rejected and nothing is written.
- Bulk confirmation: `decideLedgerBatch` accepts `{ action: "confirm" }` items. The server recomputes the suggestion and only confirms an exact single-bill match, so a stale page cannot confirm bills that changed.
- The review screen shows the bank line and the proposal per row with **Confirm**, **Change**, **Keep as credit** and **Not a bill**. A possible duplicate hides the one-tap actions so the admin compares the manual records inside Change. Shared payments keep the split flow. Matching a transfer to manual records stays available inside Change as the secondary path.

## Migration 0018 `review_groups`

1. Remaps stored groups: `purpose` and `duplicate` become `unclear`, `assignment` becomes `shared`.
2. Automatic credits whose receipt already carries a reviewed allocation (legacy bill assignments frozen by 0017, or an explicit admin allocation) are kept and marked `decision_origin='review'`, so re-import never touches them.
3. Every other automatic credit is queued as a `bank` ledger event. The next sync re-classifies it as `review` and reverses its posting, so it appears on the review screen with a suggestion and the admin confirms it explicitly. Balances for those housemates rise until that is done; the 0017 backup advice applies.
