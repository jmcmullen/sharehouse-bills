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
