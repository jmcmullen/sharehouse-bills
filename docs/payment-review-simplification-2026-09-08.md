# Payment review simplification

## Implemented and applied after approval

The approved reclassification is complete in the live database. All 1,961 queued automatic decisions were rechecked, with zero events left pending. The previous audit below is retained as the proposal that was approved.

- **39 current payments need review:** 14 missing or unclear purposes, 5 possible duplicates, 15 needing a housemate or split, and 5 payments out. The 15 assignment cases include the $760 `Matt + Sarah` receipt, which is no longer assigned wholly to Sarah.
- **Seven Oliver receipts totalling $424.28 were credited.** His ledger balance changed from $2,171.15 to **$1,746.87**. Erik, Matthew and Sarah's balances are unchanged. The $776 exclusion was preserved.
- **1,222 records are in historical reconciliation.** Another 693 records moved out of the review queue as own-account transfers, interest, merchant refunds or other non-household bank activity. Some of those 693 also predate the bill history; all remain searchable.
- Existing bills, debts, legacy payments and other legacy financial data passed before/after comparison. The only housemate configuration change was adding `Matt Blair` and `Matt` as Matthew's bank aliases. No personal-payment dismissals or shared-payment allocations were applied live.

The review page now has concise reasons, collapsible filters, readable phone cards, optional notes for routine decisions, manual-payment linking, a split form requiring exact allocation totals, and batch dismissal with a per-housemate preview. Batch decisions are limited to 10 receipts and roll back together if any receipt changed. Historical credits, refunds and duplicate overrides still require a note.

Recognised references are whole-word `cleaner`, `cleaners`, `cleaning`, `bill`, `bills`, `rent`, `gas`, `electricity`, `water`, `internet`, `internets` and `pool`, ignoring case. Sender names alone are insufficient. Missing references remain reviewable. Legacy match status cannot bypass duplicate checks. Own-account transfers, bank interest and merchant refunds cannot be credited as housemate receipts, even through the review form.

Split allocations survive reimport and use the immutable journal for corrections. Changed or deleted bank receipts reverse their allocations. Ledger snapshot export/import now includes allocations and accepts older snapshots with no allocations.

**Validation:** 21 ledger tests passed, along with TypeScript, Biome, Fallow and the production build. Local browser checks covered batch dismissal, mismatched and balanced splits, recorded split visibility, duplicate filtering, manual linking with no additional credit, and a 390px phone layout. A snapshot containing a split payment passed export/import and full read-back verification.

**Release status:** database migration `0011_payment_review_simplification.sql` and live reclassification are applied. The application changes are local and have not been committed, pushed or deployed in this step. Legacy payment links/reminders are not switched to the new ledger.

## Original read-only audit and approved proposal

Read-only inspection of the live ledger on 8 September 2026 at 15:51 AEST. All 1,961 queued records were included in the categorisation. No rules, balances or review decisions were changed. Zero ledger events were pending. This examines the imported bank history; it does not fetch new transactions from Up.

## Recommended rules

1. Accept whole words `cleaner`, `cleaners`, `bill`, `bills`, and `rent`, ignoring case and punctuation. These describe household payments. Missing or unclear payment purpose still needs review; a sender name or generic transfer description does not supply a purpose.
2. Also accept `gas`, `electricity`, `water`, `internet`, `internets`, `pool`, and `cleaning`. The history contains these references. Only Gas adds another current qualifying receipt; most other examples are historical. Add specific spelling aliases only when reviewed, such as Sarah's `Innanet` and `Inannet`, rather than fuzzy-matching arbitrary text.
3. Automatic credit still requires an identified housemate, settled external AUD money received, coverage by the ledger's charge history, and no unresolved duplicate. An approved reference removes the description problem; it must not override those other checks or an explicit exclusion.
4. Classify own-account movements, interest and merchant refunds before checking descriptions. Up provides transfer-account relationships and transaction types. Missing references on these records should not create a housemate-payment task. Merchant refunds associated with a shared bill should instead prompt a correction to that bill, never a housemate payment credit.
5. Keep pre-ledger activity in searchable historical reconciliation, outside the active badge. The oldest bill was recorded on 22 April 2026 at 14:00:23 AEST. This is the current system boundary, not proof earlier payments were unrelated or unpaid. Preserve the $776 exclusion and existing manual settlements.

## Queue impact

These rows are mutually exclusive. The counts use the present review queue, so they are a dry-run estimate, not applied decisions.

| Category | Records | Proposed treatment |
| --- | ---: | --- |
| Before recorded bill history | 1,669 | Historical reconciliation, no automatic credit |
| Own-account movements since that boundary | 222 | Ignore for housemate payments |
| Bank interest since that boundary | 12 | Ignore for housemate payments |
| Merchant refunds since that boundary | 12 | Remove from payment review; consider bill correction if relevant |
| Current eligible Cleaner/Cleaners/Bill receipts | 6 | Automatically credit $225.28 to Oliver |
| Current eligible Gas receipt | 1 | Recommend automatically crediting $199 to Oliver |
| Remaining current records | 39 | Human decisions below |
| **Total** | **1,961** | |

The requested words alone leave 40 current cases after removing historical and non-payment activity. Adding Gas leaves 39: 25 assigned to housemates and 14 other external receipts. Some of these are clearly described personal/business activity and could be dismissed together after review.

## Oliver's receipts cleared by the requested words

| Received, Sydney time | Reference | Amount |
| --- | --- | ---: |
| 14 May 2026, 19:49:21 | Cleaners | $30.00 |
| 29 Jun 2026, 13:20:08 | Cleaners | $30.00 |
| 10 Jul 2026, 13:51:53 | Cleaner | $30.00 |
| 08 Sep 2026, 13:13:42 | Bill | $19.50 |
| 08 Sep 2026, 13:13:59 | Bill | $96.24 |
| 08 Sep 2026, 13:14:17 | Bill | $19.54 |
| **Total** | | **$225.28** |

The additional Gas receipt was $199 on 14 May at 19:49:48 AEST. The full proposed reduction is $424.28. The review rule must not credit Oliver's two $420 duplicate candidates again.

## Remaining cases and simpler actions

- **Possible duplicates:** five current external receipts are flagged, separate from Sarah's internal transfer. Oliver has $420 on 29 April and an unreferenced $420 on 26 June; Matthew has $30 Cleaners on 19 May and $30 Bills on 1 July; Sarah has $30 IOU on 22 July. Existing manual records have matching amounts and housemates. Show both dates and the existing payment description, with a single **Link existing payment** action. Same amount within 14 days is only a candidate, especially for recurring rent and cleaning.
- **Personal payments:** offer one grouped review of dinner, food, Bali and gifts. There are eight incoming current known-housemate receipts with these references. Suggest **Not a household payment**, with a preview and explicit selection. Do not teach the system that all IOUs are bill payments.
- **Unclear IOUs:** retain for approval. Sarah has six other incoming IOUs in addition to the $30 duplicate candidate. They range from $60 to $671 and need a purpose check.
- **Shared beneficiary:** Sarah's $760 on 23 April says `Matt + Sarah`. The current assignment to Sarah is insufficient. Provide a split action whose allocations must sum to the receipt. Do not assume a 50/50 split or credit both for the full amount.
- **Missing reference:** Oliver's $420 on 26 June must stay reviewable, even though it resembles rent. Camilla Smith's $50 on 25 July has no reference and no known housemate assignment. Keep it discoverable under unidentified receipts.
- **Unknown beneficiary:** Jay's $722.90 `Bills` transfer on 4 July has a valid purpose but no housemate allocation. Keep an assignment task, not a missing-description task. Do not exclude every transfer sent by Jay because the history includes `Bills for Oliver`.
- **Money out:** five current external payments to known housemates need separate handling. Sarah received $205 Bills, $1,000 Dinner, $400 IOU and $34 IOU; Erik received $80 Cleaners. A household-looking description cannot turn these into incoming credits. Only a confirmed refund to a housemate should increase their account balance.
- **Sender aliases:** add `Matt Blair` and `Matt` as explicit aliases for Matthew, with ambiguity checks. The configured alias is only `MATTHEW BLAIR`, while actual receipts use `Matt Blair`. Matching a known sender should not approve an unclear purpose.

## Suggested page

Use one **Needs attention** page, grouped by **Missing or unclear purpose**, **Already recorded?**, **Choose housemate or split**, and **Money out**. Show housemate, amount, exact payment date/time and reference immediately. Display a readable reason such as `No payment reference`, rather than a generic reason or internal source key.

Keep **Unidentified receipts** as a visible secondary list, and **History** and **Ignored** searchable without inflating the active badge. The badge should count the selected actionable scope, not all historical bank imports. Owner transfers and missing-reference receipts must not disappear solely because no housemate has yet been assigned.

For routine decisions, use **Credit account**, **Link existing payment**, and **Not a household payment**. The action and selected category can supply the audit reason; make a written note optional unless overriding an unusual case. Allow selected rows to be reviewed together with a total and per-housemate preview. Keep stale-record checks and preserve explicit approvals/exclusions on reimport.

Recheck existing automatic review records when rules change. Several still carry an earlier generic reason, so changing the keyword function alone would leave stale queue entries until they are reprocessed.

## All 34 current known-housemate records

Amounts are signed from Jay's bank account: positive is money received and negative is money sent. Names are existing ledger assignments, not new approvals.

| Received, Sydney time | Housemate | Reference | Amount | Recommendation |
| --- | --- | --- | ---: | --- |
| 23 Apr 2026, 10:56:21 | Sarah O'Dwyer | Matt + Sarah | $760.00 | Review beneficiary split; do not assign all to Sarah |
| 23 Apr 2026, 15:02:47 | Sarah O'Dwyer | Bills | −$205.00 | Money out: review separately; do not credit as money received |
| 25 Apr 2026, 20:12:50 | Matthew Blair | dinner | $35.00 | Suggest Not a household payment; confirm as a group |
| 29 Apr 2026, 11:47:55 | Oliver Caprile | Bills for Oliver | $420.00 | Possible duplicate: compare and link existing manual payment |
| 29 Apr 2026, 12:33:19 | Sarah O'Dwyer | Sarah | −$372.00 | Own-account transfer: remove from payment review; no credit |
| 29 Apr 2026, 12:33:20 | Sarah O'Dwyer | Sarah | $372.00 | Own-account transfer: remove from payment review; no credit |
| 29 Apr 2026, 16:56:32 | Sarah O'Dwyer | IOU | $100.00 | Purpose unclear: retain for review |
| 04 May 2026, 21:11:49 | Matthew Blair | dinner | $80.00 | Suggest Not a household payment; confirm as a group |
| 05 May 2026, 17:58:23 | Sarah O'Dwyer | Food | $80.00 | Suggest Not a household payment; confirm as a group |
| 12 May 2026, 23:50:58 | Sarah O'Dwyer | IOU | $671.00 | Purpose unclear: retain for review |
| 12 May 2026, 23:54:45 | Sarah O'Dwyer | Dinner | −$1,000.00 | Money out: review separately; do not credit as money received |
| 13 May 2026, 00:16:22 | Sarah O'Dwyer | IOU | $417.84 | Purpose unclear: retain for review |
| 14 May 2026, 19:49:21 | Oliver Caprile | Cleaners | $30.00 | Automatic credit under requested reference rule |
| 14 May 2026, 19:49:48 | Oliver Caprile | Gas | $199.00 | Recommend accepting Gas as a household reference |
| 19 May 2026, 11:50:19 | Matthew Blair | Cleaners | $30.00 | Possible duplicate: compare and link existing manual payment |
| 27 May 2026, 20:16:40 | Sarah O'Dwyer | IOU | −$400.00 | Money out: review separately; do not credit as money received |
| 02 Jun 2026, 17:19:27 | Sarah O'Dwyer | IOU | $400.00 | Purpose unclear: retain for review |
| 09 Jun 2026, 23:02:50 | Sarah O'Dwyer | Bali | $500.00 | Suggest Not a household payment; confirm as a group |
| 23 Jun 2026, 23:29:47 | Sarah O'Dwyer | BALI | $500.00 | Suggest Not a household payment; confirm as a group |
| 26 Jun 2026, 07:59:26 | Oliver Caprile | (missing) | $420.00 | Possible duplicate: compare and link existing manual payment |
| 29 Jun 2026, 13:20:08 | Oliver Caprile | Cleaners | $30.00 | Automatic credit under requested reference rule |
| 01 Jul 2026, 02:11:58 | Sarah O'Dwyer | Bali | $500.00 | Suggest Not a household payment; confirm as a group |
| 01 Jul 2026, 12:34:01 | Matthew Blair | Bills | $30.00 | Possible duplicate: compare and link existing manual payment |
| 07 Jul 2026, 18:39:40 | Sarah O'Dwyer | Bali DONE | $603.00 | Suggest Not a household payment; confirm as a group |
| 10 Jul 2026, 13:51:53 | Oliver Caprile | Cleaner | $30.00 | Automatic credit under requested reference rule |
| 12 Jul 2026, 20:09:52 | Sarah O'Dwyer | IOU | −$34.00 | Money out: review separately; do not credit as money received |
| 14 Jul 2026, 21:41:44 | Sarah O'Dwyer | IOU | $90.00 | Purpose unclear: retain for review |
| 22 Jul 2026, 00:30:46 | Sarah O'Dwyer | IOU | $30.00 | Possible duplicate: compare and link existing manual payment |
| 22 Jul 2026, 00:35:36 | Sarah O'Dwyer | IOU | $60.00 | Purpose unclear: retain for review |
| 22 Jul 2026, 15:08:36 | Erik Villa | Cleaners | −$80.00 | Money out: review separately; do not credit as money received |
| 20 Aug 2026, 10:05:46 | Sarah O'Dwyer | Anita present | $125.00 | Suggest Not a household payment; confirm as a group |
| 08 Sep 2026, 13:13:42 | Oliver Caprile | Bill | $19.50 | Automatic credit under requested reference rule |
| 08 Sep 2026, 13:13:59 | Oliver Caprile | Bill | $96.24 | Automatic credit under requested reference rule |
| 08 Sep 2026, 13:14:17 | Oliver Caprile | Bill | $19.54 | Automatic credit under requested reference rule |

## Other 14 current external receipts

These exclude Up-identified interest, merchant refunds and own-account movements. Keep relevant unknown receipts available for assignment. Suggested non-household classifications are recommendations, not applied decisions.

| Received, Sydney time | Bank description | Reference | Amount |
| --- | --- | --- | ---: |
| 24 Apr 2026, 11:17:52 | Evolving Digital | 7771 | $12,500.00 |
| 29 Apr 2026, 12:49:43 | MICHAEL YANEZ | dinner | $60.00 |
| 08 May 2026, 19:52:05 | Jay McMullen | IOU | $2.00 |
| 13 May 2026, 04:03:32 | M MACK | Dinner | $375.00 |
| 15 May 2026, 16:56:08 | Eren Kalender | Dinner | $35.00 |
| 25 Jun 2026, 11:16:24 | JAY MCMULLEN | Development | $4,000.00 |
| 26 Jun 2026, 18:52:16 | MICHAEL YANEZ | blank dj | $150.00 |
| 04 Jul 2026, 11:31:26 | Jay McMullen | Bills | $722.90 |
| 05 Jul 2026, 16:30:20 | Dazza | Bike sales | $109.00 |
| 06 Jul 2026, 14:13:49 | Dazza | Green slip | $640.00 |
| 25 Jul 2026, 22:26:11 | Camilla Smith | (missing) | $50.00 |
| 31 Jul 2026, 11:45:50 | Evolving Digital | 7772 | $6,250.00 |
| 08 Aug 2026, 16:02:26 | Plaza Mo Groov | Legend tax | $40.00 |
| 10 Aug 2026, 07:32:11 | Richard Alexander Fo | Good groove + Camilla | $150.00 |

## Evidence

Live read-only queries of `ledger_bank_transactions`, `ledger_sources`, `housemates`, `bills` and pending `ledger_events`. Up's imported raw transaction metadata confirmed the transfer relationships, 12 Interest transactions totalling $16.39, and 12 Refund transactions totalling $25.94. Detailed bank snapshots remain outside the repository.
