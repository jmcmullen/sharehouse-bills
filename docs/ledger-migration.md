# Housemate ledger migration

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

Select a housemate in Accounts and choose **Share private statement**. Create a link, then copy it and share it privately. The app does not send the link automatically. Creating another link invalidates the previous link immediately, and **Revoke access** disables it. Links expire after 90 days.

The `/statement/$token` page is read-only and scoped to one housemate. It shows the account balance, amount due, upcoming charges, current payment history and running balance. Payment references are included, but raw bank data, sender details, internal source identifiers, admin reasons and other housemates' records are excluded. It uses the same phone-friendly activity layout and filters as Accounts. Internal reversal entries do not appear as duplicate payments.

Tokens contain 256 bits of randomness; only their SHA-256 hashes are stored. Invalid, replaced, revoked and expired links return an unavailable page. Responses use `private, no-store`, `no-referrer` and `noindex` protections. Application request logs redact statement URL tokens. A valid statement link refreshes recorded ledger changes before loading; invalid links cannot trigger that refresh.

These application changes still require deployment. Both database migrations and the strict-rule recheck are complete in the live database. Existing pay links and reminders continue using the legacy balances until the coordinated cutover.

## What was migrated

| Source | Records |
| --- | ---: |
| Existing bills | 58 |
| Housemate bill shares | 232 |
| Legacy payment records inspected | 461 |
| Legacy unreconciled records covered by Up history | 214 |
| Up transactions imported across 109 pages | 10,811 |
| Charge entries in the new ledger | 232 |
| Payment entries in the new ledger | 210 |
| Total ledger entries | 442 |

Every legacy bank transaction ID exists in the imported bank history. Legacy manual payments are preserved separately. Unmatched receipts are retained as evidence and credited only when identified as household payments or explicitly reviewed. No opening-balance shortcut was used.

Up supplies the bank history. Invoice details, due dates and each housemate's share come from the existing bill records. Bank transactions alone cannot reconstruct those obligations. Historical bank transfers before the recorded bill history require review because their corresponding charges may already have been settled outside this system.

## Original migration balances, before the stricter reference rule

All amounts are AUD. These are the verified balances on 8 September 2026, including future charges already recorded. Review decisions and subsequent transactions can change them.

| Housemate | Legacy balance | New ledger balance | Reduction |
| --- | ---: | ---: | ---: |
| Erik Villa | $2,654.94 owed | $2,282.94 owed | $372.00 |
| Matthew Blair | $148.73 owed | $88.73 owed | $60.00 |
| Oliver Caprile | $2,055.87 owed | $1,746.87 owed | $309.00 |
| Sarah O'Dwyer | $1,252.01 owed | $241.99 credit | $1,494.00 |

The differences are traceable to these receipts and one existing inconsistency:

- Erik: $372 received on 11 August, reference `Bills`.
- Matthew: $30 received on 15 July, reference `Bills`. A further $30 difference was already present between recorded payments and the old debt-paid totals. The ledger retains the payment history; this discrepancy needs review before cutover.
- Oliver: five missed receipts totalling $309, listed below.
- Sarah: $378 received on 12 May, reference `Bills`, and $1,116 received on 2 September, reference `Rent`.

These amounts are credited in the new ledger, not written back into legacy bill paid flags.

### Oliver

| Received in Sydney time | Amount | Bank reference |
| --- | ---: | --- |
| 14 May 2026, 19:49:21 AEST | $30.00 | Cleaners |
| 14 May 2026, 19:49:48 AEST | $199.00 | Gas |
| 29 June 2026, 13:20:08 AEST | $30.00 | Cleaners |
| 10 July 2026, 13:51:53 AEST | $30.00 | Cleaner |
| 22 July 2026, 10:48:28 AEST | $20.00 | Bills |
| **Total** | **$309.00** | |

The $776 transfer on 1 May is explicitly excluded from additional credit, following Jay's confirmation that it was earlier rent already recorded manually. That decision survives reimports.

Oliver's statement shows $1,156.73 due now and $590.14 upcoming. The ledger applies money received across the account, with due charges covered first. It does not attempt to label each transfer as payment for an exact bill. The original screenshot reconciliation is in [the Oliver payment audit](oliver-payment-audit-2026-09-08.md).

## How the ledger works

Each bill share adds a positive charge. Each receipt subtracts money. Refunds increase the amount owed. A negative balance is credit carried forward. All calculations use integer cents, and due-day comparisons use Sydney calendar dates.

`ledger_entries` is an immutable journal. Corrections append a reversal and replacement instead of changing the original entry. `ledger_sources` identifies the current version of each charge or payment. A bank transaction has one source key shared by the legacy migration and the Up importer, so reimporting the same transaction does not credit it twice.

`ledger_bank_transactions` retains bank evidence, housemate assignment, review decision and reason. A bank receipt can be linked to an existing manual payment of the same amount for the same housemate. Linking adds no extra credit. Explicit review decisions take precedence over automatic classification. Potential manual duplicates are held for review.

`ledger_events` captures legacy bill-share and payment changes through database triggers. The sync command processes each event transactionally. The account and review pages sync trusted source changes when opened and provide refresh actions. This lets the old system continue operating while the ledger is evaluated.

The authenticated bank webhook can also update the ledger when `LEDGER_ENABLED=true`. It handles created, settled and deleted bank transactions. The flag does not switch reminders or payment links to the ledger.

## Review work before phase-out

There are 1,954 bank records held for review, with no additional credit from those records. This includes unrelated or historical account activity, internal transfers, ambiguous references and possible manual duplicates. It is not a count of missing household payments.

| Identified housemate | Review records |
| --- | ---: |
| Erik | 19 |
| Matthew | 33 |
| Oliver | 5 |
| Sarah | 210 |
| Unidentified | 1,687 |

Oliver's five remaining records include two possible manual-payment duplicates and three older transfers. They are separate from the five newly credited receipts totalling $309. The excluded $776 is no longer in his review queue.

Before retiring the legacy system:

1. Review household receipts that could affect balances, link receipts already recorded manually, and resolve Matthew's $30 legacy inconsistency.
2. Deploy this code, enable ledger bank ingestion, import an overlapping recent Up date range, and drain pending legacy events.
3. Compare the statements with the bank evidence and approve the account balances.
4. Switch housemate-facing balances, reminders and manual payment entry to the ledger in one coordinated change. Remove exact-bill matching as a condition for recognising money received.
5. Keep the old records available as an archive until the new workflow has been verified. Stop the legacy writer only after the final event sync and comparison.

## Operating commands

Use the intended database environment explicitly. Full financial snapshots contain private data and must stay outside the repository.

```sh
# Apply schema migrations, including trigger-based change capture.
bun run db:migrate

# Process new or changed legacy charges/payments.
bun run ledger --sync

# Import all available Up history. Safe to rerun by transaction ID.
bun run ledger --import-up

# Catch up using an overlapping period. Choose the date for the actual gap.
bun run ledger --import-up --since 2026-09-01T00:00:00+10:00

# Import a captured complete bank snapshot into a local rehearsal database.
bun run ledger --bank-file /private/tmp/bank-snapshot.json

# Apply reviewed decisions; each needs a transaction ID, action and reason.
bun run ledger --decisions /private/tmp/reviewed-decisions.json

# Read balances, legacy differences, bank counts and review records.
bun run ledger --report /private/tmp/ledger-report.json

# Transfer a fully rehearsed ledger to the corresponding legacy database.
bun run ledger:transfer --export /private/tmp/prepared-ledger.json
bun run ledger:transfer --import /private/tmp/prepared-ledger.json
```

The bank-file format is `{ "complete": true, "transactions": [...] }`. Review actions are `credit`, `exclude` or `link`; credit requires `housemateId`, and link also requires `manualSourceKey`.

The transfer checks a fingerprint of all seven legacy financial tables before writing. It refuses independent changes in the target ledger and can resume the same partial import. Read-back verification uses bounded pages to avoid database response limits. Only matching historical outbox payloads are marked processed; later changes remain queued for the next sync. Use the SQL migration, not `db:push`, because the change-capture and immutability triggers are part of the migration.

## Verification

- Fresh-database schema installation and repeated migration succeeded.
- Rehearsed the full bill/payment migration and Up import on an isolated SQLite copy.
- Repeated the prepared-data import locally without duplicate entries.
- Applied the additive migration and import to the live database; every transferred row passed read-back comparison. The legacy fingerprint was unchanged and pending events were zero.
- Automated tests cover partial and excess payments, duplicate imports, manual-payment linking, reassignment, immutable corrections, refunds, rollback, settlement/currency checks, deleted receipts, due-date calculations and Up pagination.
- The authenticated local UI showed Oliver's verified totals. Linking a receipt to an existing manual payment removed it from the local review queue without changing his balance. All UI test writes were confined to the isolated local database.
- TypeScript, Biome and the production build passed. No application deployment or legacy phase-out has been performed.

### Additional verification for approvals and statements

- Fourteen tests cover the strict reference gate, rejection of singular Bill and unrelated descriptions, explicit approvals surviving reimport, stale-decision conflicts, and public-link isolation, expiry, rotation and revocation.
- Browser testing covered approving a held receipt in the isolated local database and confirming the exact balance reduction, private-link creation and revocation, the housemate-only page, and responsive activity layout at a 390px phone width.
- An unauthenticated HTTP request to the local private statement returned the scoped page with the expected cache and privacy headers.
- The live rule migration processed 163 queued receipts and finished with zero pending events. All other housemate balances matched the rehearsal.
