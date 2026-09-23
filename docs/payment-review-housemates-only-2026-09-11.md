# Housemate-only payment review

Unmatched incoming payments now go to **Ignored**. A household reference such as `Bills` or `Rent` does not make an unknown sender a housemate. Bank evidence remains available for an explicit assignment if needed.

Recognised housemates with missing or unclear references still need review. Payments naming multiple housemates remain reviewable for allocation. Explicit admin decisions and legacy housemate assignments are preserved. Deleting an ignored bank transaction no longer creates a review task.

The review page now says **All housemates** and removes the prompt to assign unidentified personal receipts. Unidentified-sender filters remain available in the history and decision views.

## Live cleanup

Migration `0012_housemate_only_payment_review` rechecked 15 automatic, unassigned review records. Fourteen unrelated personal receipts moved to Ignored. The shared Matt/Sarah receipt stayed in review.

- Review queue: **39 → 25**.
- All housemate balances, ledger entries, source records and allocations were unchanged.
- All seven legacy financial tables and explicit admin decisions were unchanged.
- No migration events remain pending.

A private backup and before/after evidence are saved outside the repository under `/private/tmp/oliver-payment-audit/housemate-only-*`. The cleanup was rehearsed against a local copy before applying it live.

## Verification and UI testing

All 23 ledger tests, TypeScript, Biome, Fallow and the production build passed. Regression tests cover unknown senders with blank and household references, deleted personal receipts, recognised housemates, shared payments, migration replay and explicit approvals.

The application changes have not been deployed. Browser verification is incomplete and is left to the user, as requested. In the updated app, check that Needs attention shows 25 housemate payments, blank-reference housemate receipts remain reviewable, and personal receipts appear only in Ignored.
