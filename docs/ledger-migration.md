# Housemate ledger migration

**24 September 2026:** payments are no longer matched to bills automatically. See [Explicit payment matching](explicit-payment-matching-2026-09-24.md) for the decision, phase 1 changes and migration 0017.

The latest implementation and migration results are in [Payments and bill allocations](payment-bill-allocations-2026-09-11.md). All 19 manual payments now retain their bill assignments, and matched bank evidence confirms the same money. Earlier figures below are historical snapshots.

Current review rules and the 11 September cleanup are documented in [Housemate-only payment review](payment-review-housemates-only-2026-09-11.md). The live queue now contains 25 housemate payments. Unmatched personal receipts are ignored. Earlier reconciliation figures below are historical snapshots.

## Latest update: simpler payment review

The approved simplification was applied on 8 September 2026. The live queue is now **39 current cases** and Oliver's ledger balance is **$1,746.87**, after crediting the seven receipts totalling **$424.28**. Missing references remain reviewable; cleaning, bill/rent and utility references are accepted. Other housemate balances and legacy financial records are unchanged. The $776 exclusion remains in place.

See [payment review simplification](payment-review-simplification-2026-09-08.md) for current rules, remaining cases, split/batch workflows and verification. Migration 0011 is applied live; the accompanying application changes are not yet committed or deployed. The stricter Bills/Rent-only policy and its queue counts below are superseded historical records.

The new ledger is implemented alongside the existing payment system. Migration `0009_housemate_ledger` and the historical import were applied to the live database on 8 September 2026. Full read-back verification passed, the seven legacy financial tables were unchanged, and no ledger events remained pending at verification.

The application changes are local and have not been deployed. After deployment, the authenticated `/ledger` page provides account statements and a bank-payment review queue. Existing payment links, bill paid flags and reminders still use the legacy system during this review period.

## Payment approvals and private statements

The reference rule was tightened on 8 September 2026. Automatic bank credits now require the whole word **Bills** or **Rent** in the reference or description, case-insensitively. Singular `Bill`, `Gas`, `Cleaner`, `Cleaners`, and blank references need admin approval. The bank sender must still identify a housemate, and settlement, currency, historical coverage and duplicate checks still apply. Legacy automatic bill matching cannot bypass the reference rule. Existing manual entries and explicit admin decisions are preserved.

Migration `0010_ledger_statement_links` was applied to the live database. It queued all 163 previously credited bank receipts for rechecking. Seven receipts totalling **$424.28**, all Oliver's, moved to review. Their old credits were reversed in the immutable journal. Oliver's provisional balance is now **$2,171.15**, pending approval. The other three housemate balances below are unchanged. There are **1,961** review records across the entire bank history; **34** are identified-housemate records since the bill history began. No migration events remain pending. The original migration figures below are retained as the earlier comparison, not the current Oliver balance.

### Oliver receipts moved to approval

| Received, Sydney time | Reference | Amount |
| --- | --- | ---: |
| 14 May 2026, 19:49:21 AEST | Cleaners | $30.00 |
| 14 May 2026, 19:49:48 AEST | Gas | $199.00 |
| 29 June 2026, 13:20:08 AEST | Cleaners | $30.00 |
| 10 July 2026, 13:51:53 AEST | Cleaner | $30.00 |
| 8 September 2026, 13:13:42 AEST | Bill | $19.50 |
| 8 September 2026, 13:13:59 AEST | Bill | $96.24 |
| 8 September 2026, 13:14:17 AEST | Bill | $19.54 |
| **Total awaiting approval from this recheck** | | **$424.28** |

The $20 receipt labelled `Bills` remains credited. The earlier $776 exclusion remains unchanged. The seven receipts above are held for Jay's decision; no approval was applied to them in the live database.

### Admin workflow

- **Payment review** at `/payment-review` is a separate authenticated page. It starts with known housemates during the recorded bill history, with filters for housemate, older history, unidentified senders, reference text and decision status.
- Review a receipt to see its bank description, reference, Sydney date and time, amount, and reason it was held. Select the housemate and enter a reason to approve or exclude it.
- When a manual payment has the same amount, the dialog offers linking to it instead of adding another credit. Already-linked manual payments cannot be linked twice.
- The Recorded, Linked and Excluded views allow decisions to be inspected and corrected. Stale browser submissions are rejected if another process changed the receipt.
- **Accounts** at `/ledger` shows current charges and payments, newest first, with search and payment/charge filters. Running balances always include all activity, regardless of the selected filter. Cancelled entries are hidden by default; the admin can include the correction history.
- Recorded source changes are synced when an account or review page is opened. The refresh buttons also resync and reload the current balances.

### Housemate access

Each housemate's statement lives behind their pay link at `/pay/<token>/statement`, reached from the **View statement** button on the pay page. Any pay link (all bills, a stack or a reminder) opens the whole account for that housemate; the signed pay token is the only access control, and an invalid token shows the expired-link page. The separate private statement links (`/statement/<token>`) and their `ledger_statement_links` table were removed in migration `0020_drop_statement_links`.

The statement is read-only and uses the pay page layout. It shows the pay page headline and credit note, then bill shares and payments on one timeline grouped by Sydney month, newest first, with the last three months shown and older months behind **Show earlier**. Bill statuses (Paid, Part paid, Covered by credit, Overdue, Due) use the same per-share credit cover as the pay page. Payments name the bills they covered or the credit they left. Raw bank data, bank transaction ids, suggestions, admin reasons, journal corrections and other housemates' records are excluded. Responses use `private, no-store`, `no-referrer` and `noindex` protections.

### Additional verification for approvals and statements

- Fourteen tests cover the strict reference gate, rejection of singular Bill and unrelated descriptions, explicit approvals surviving reimport, stale-decision conflicts, and public-link isolation, expiry, rotation and revocation.
- Browser testing covered approving a held receipt in the isolated local database and confirming the exact balance reduction, private-link creation and revocation, the housemate-only page, and responsive activity layout at a 390px phone width.
- An unauthenticated HTTP request to the local private statement returned the scoped page with the expected cache and privacy headers.
- The live rule migration processed 163 queued receipts and finished with zero pending events. All other housemate balances matched the rehearsal.
