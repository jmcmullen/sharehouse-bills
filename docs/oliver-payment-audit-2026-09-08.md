# Oliver payment audit

Prepared 8 September 2026. All amounts are AUD and all dates use Australia/Sydney time.

## Result

Oliver's recorded payments add up internally, but the bank history does not fully reconcile with the bills ledger. Five received payments labelled as household expenses, totalling **$309.00**, have no matched allocation or recorded credit. Jay has confirmed that the separate **$776.00** transfer was rent and that Oliver previously paid less than $420.00 per week. Jay has instructed that this rent was already accounted for manually and must not be credited again against the other bills.

The app currently records **$2,055.87 outstanding**, made up of **$1,465.73 overdue** and **$590.14 not yet due**. If the five uncredited payments all belong to the bills currently recorded, the outstanding balance would fall to **$1,746.87**. The agreed working balance is therefore **$1,746.87**, retaining the existing rent and manual-payment treatment and deducting only the five missed payments. The $776.00 is excluded from further credit on Jay's instruction. The app will continue to show $2,055.87 until the $309.00 is actually allocated. Historical evidence limitations remain documented below.

This was a read-only audit. No balances, allocations, bank transactions, or notifications were changed.

## Follow-up: Oliver's screenshots

Rechecked the live ledger at 13:31 AEST on 8 September after receiving Oliver's three ANZ screenshots. All seven visible payments are already fully credited, totalling $1,012.41. None needs another paid entry.

| Payment date | Amount | Existing allocation |
| --- | --- | --- |
| 28 May 2026 | $450.00 | $420.00 rent due 29 May and $30.00 cleaners due 6 May |
| 5 Jun 2026 | $432.50 | $420.00 rent due 5 June and $12.50 pool maintenance due 26 June |
| 31 Aug 2026 | $30.00 | Cleaners due 3 June |
| 31 Aug 2026 | $15.70 | Pool maintenance due 31 August |
| 31 Aug 2026 | $27.05 | Water due 1 September |
| 1 Sep 2026 | $30.00 | Cleaners due 1 July. This is the circled payment. |
| 1 Sep 2026 | $27.16 | Gas due 20 August |

The cleaner payments made in August and September cleared older cleaner bills. They did not clear the cleaner bills due around their payment dates, which may explain the confusion. That explanation is an inference; the allocations above are verified facts.

The ledger balance remains $2,055.87. The separate five uncredited household payments still total $309.00. Applying those to the current recorded charges would leave $1,746.87 outstanding, subject to the manual-entry and historical-balance assumptions documented below. Jay subsequently confirmed that the $776.00 transfer was rent and instructed that it be treated as already accounted for manually, with no further deduction.

The five receipts needing reconciliation are $30.00 Cleaners and $199.00 Gas on 14 May, $30.00 Cleaners on 29 June, $30.00 Cleaner on 10 July, and $20.00 Bills on 22 July. They need payment allocations or credit, rather than another entry for any payment shown in the screenshots. Exact bill allocations are still to be agreed. No production changes were made during this follow-up.

## Coverage and evidence

- Read the live Turso database at 13:20 AEST and verified at 13:25 AEST that the queried records were unchanged.
- Read all 109 pages returned by the connected Up Bank transactions API, covering 10,811 unique transactions from 24 January 2019 to 8 September 2026. Pagination reached its end. The latest transaction in that snapshot settled at 13:14:17 AEST on 8 September.
- Searched descriptions, raw sender names, payment messages, and notes for Oliver, Capril/Caprile, Oli, and Ollie. Also looked up bank transactions linked to the payment ledger.
- Identified 37 incoming transfers directly naming Oliver Caprile, three incoming transfers from Jay referring to Oliver, and one outgoing transfer to Oliver. Five older search hits concerned another Oliver or unidentified Oli transfers with unrelated references; they were excluded.
- Checked all 58 debts assigned to Oliver, all 33 matched payment records, relevant ignored payments, and the unreconciled queue. The full database snapshot contained 461 payment records, 214 queue records, 232 debts, and 58 bills.
- Recalculated money in integer cents. Checked bank amounts and settlement status, payment-to-debt links, duplicate allocations, paid flags, bill statuses, and configured rent shares.

The database records charges due from 21 January to 24 September 2026. It does not contain a complete earlier bill ledger. This audit covers the available connected account and stored bill amounts; it does not independently verify every original supplier invoice, cash payment, other bank account, or historical opening balance.

## Current ledger

| Item | Amount |
| --- | --- |
| Charges assigned to Oliver across 58 bills | $10,930.53 |
| 30 matched Up Bank payments | $8,004.66 |
| 3 manual payment entries | $870.00 |
| Total recorded payments | $8,874.66 |
| Stored credit balance | $0.00 |
| Outstanding on all recorded bills | $2,055.87 |
| Overdue before 8 September 2026 | $1,465.73 |
| Due after 8 September 2026 | $590.14 |

$10,930.53 − $8,874.66 − $0.00 = $2,055.87. There are 36 fully paid debts and 22 unpaid debts, with no partial payments recorded.

| Category | Bills | Charged | Recorded paid | Outstanding |
| --- | --- | --- | --- | --- |
| AGL Electricity | 9 | $1,428.11 | $96.24 | $1,331.87 |
| AGL Gas | 9 | $195.20 | $66.20 | $129.00 |
| Cleaners | 10 | $300.00 | $150.00 | $150.00 |
| Neptune Internet | 1 | $35.00 | $35.00 | $0.00 |
| Pool maintenance | 5 | $68.20 | $43.20 | $25.00 |
| Rent | 21 | $8,820.00 | $8,400.00 | $420.00 |
| Telstra | 1 | $27.80 | $27.80 | $0.00 |
| Water | 2 | $56.22 | $56.22 | $0.00 |

Rent is recorded as paid for all 20 weekly charges from 24 April through 4 September 2026. The remaining $420.00 rent charge is due 11 September. Oliver's $420.00 weekly amount matches his configured custom rent assignment, rather than an equal fifth of the $1,940.00 house rent.

## Payments requiring reconciliation

### Five household payments have not been credited

These five bank transactions are settled and their stored amounts agree with Up Bank. None has a matched debt allocation or a credit entry. Their references identify household expenses, but the exact bill periods are not recorded.

| Received | Reference | Amount | App status | Bank transaction ID |
| --- | --- | --- | --- | --- |
| 14 May 2026 | Cleaners | $30.00 | ignored | `f10699da-c9ad-4725-929f-22497d502960` |
| 14 May 2026 | Gas | $199.00 | ignored | `3566c98a-c794-408a-a779-cf158ac6c85d` |
| 29 Jun 2026 | Cleaners | $30.00 | ignored | `c9dbf0fa-e2d5-4923-95bc-69127b8595ef` |
| 10 Jul 2026 | Cleaner | $30.00 | ignored | `f41eea4a-ed70-4a11-810e-5754d2f85b21` |
| 22 Jul 2026 | Bills | $20.00 | unreconciled | `333442d5-fdfa-4400-8252-25ba44bbc2b1` |

Total: **$309.00**, comprising $90.00 for cleaners, $199.00 labelled Gas, and $20.00 labelled Bills.

The current matching code only recognises the billing words `rent`, `bill`, and `bills`. A transfer labelled `Gas`, `Cleaner`, or `Cleaners` fails that gate and is ignored. The $20.00 payment passed the wording check but was left unreconciled with `no_match`; the code requires an exact open debt or combination of debts before allocating it. The recorded statuses are consistent with these rules.

The $199.00 gas payment exceeds the $129.00 currently outstanding in the gas category. Its allocation needs to preserve any excess as credit or apply it with an agreed purpose. Simply marking one gas bill paid would lose part of the payment.

### Date-based allocation of the $309.00

Compared the bank settlement timestamps with debt creation times, bill due dates, payment records, and historical WhatsApp notification delivery records. Times below are AEST. The receipt amounts and references are confirmed. Specific cleaner bill matches are the strongest timing-based candidates, not explicit invoice references from Oliver.

| Received | Amount and reference | Best supported interpretation | Current treatment needed |
| --- | --- | --- | --- |
| 14 May 2026, 19:49:21 | $30.00, Cleaners | Likely cleaners due 20 May. That bill was created at 10:43:51 that morning and its group notification was sent at 10:44:04. The older 6 May cleaner bill was also unpaid then, so timing does not prove which one Oliver intended. | The 20 May bill is now paid by the separate 30 July $30.00 transfer. Preserve both receipts and carry this extra $30.00 forward, or reallocate the later receipt if rebuilding history. |
| 14 May 2026, 19:49:48 | $199.00, Gas | Confirmed gas reference, sent 27 seconds after the cleaner payment. Five gas shares existed then: $19.50 due 21 January, $19.54 due 20 February, $18.69 due 20 March, $20.53 due 22 April, and $26.58 due 21 May. Together they were $104.84, so this is not an exact payment for one bill or all existing gas bills. | Record the whole $199.00 as a received payment with an allocation or credit. Do not mark a $199.00 gas bill paid: no such recorded share existed. Do not label later gas bills as its proven original purpose. |
| 29 June 2026, 13:20:08 | $30.00, Cleaners | Likely cleaners due 1 July, created and notified on 25 June. Older unpaid cleaner bills also existed. | The 1 July bill is now paid by the separate 1 September $30.00 transfer. Preserve both receipts and carry this extra $30.00 forward, or reallocate the later receipt. |
| 10 July 2026, 13:51:53 | $30.00, Cleaner | Likely cleaners due 15 July, created and notified the previous morning, 9 July. It was sent between Oliver's rent payment at 13:51:13 and water payment at 13:52:42. Older unpaid cleaner bills also existed. | The 15 July cleaner bill is still unpaid. This is the strongest candidate for a direct $30.00 allocation. |
| 22 July 2026, 10:48:28 | $20.00, Bills | No exact match to a then-open non-rent bill or combination. The nearby gas bill due 21 July was $12.16, electricity due 23 July was $190.05, and pool maintenance due 24 July was $12.50. The generic reference does not select one of them. | Record $20.00 as unallocated credit or an explicitly chosen partial payment; the evidence does not justify marking a particular bill fully paid. |

No combination of the 12 then-open non-rent shares equals the $199.00 received on 14 May. No combination of the 19 then-open non-rent shares equals the $20.00 received on 22 July. These reconstructions use surviving records and payment timestamps, not a complete historical change log.

A practical reconciliation that preserves all existing paid entries is to apply the missing $90.00 of cleaner receipts to the oldest three currently unpaid cleaner charges: 15 July, 29 July, and 12 August, $30.00 each. Their debt IDs are `Iw6Kt5As4L-wEdccr_z4e`, `s5ELj_uQVKOykPn6LnL6X`, and `rYfQDQF_pTHbGxOpmGQtY`. This is a proposed carry-forward allocation, not a claim that the May and June payments originally referred to July and August bills. It leaves cleaners due 26 August and 9 September unpaid, totalling $60.00.

The remaining $219.00 must also be preserved as payment value: $199.00 labelled Gas and $20.00 labelled Bills. They can be recorded as unallocated credit pending a chosen allocation; the dated evidence does not establish an exact original invoice allocation. The $199.00 exceeds even today's remaining gas charges of $129.00, including the future September bill, by $70.00. Any allocation must retain that excess. Applying $90.00 to cleaners and recording $219.00 of unallocated credit would give the same net balance of $1,746.87 without guessing which utility bill Oliver meant. No allocations or credits have been written to production.

### The $776.00 transfer was rent at Oliver's earlier rate

On 1 May 2026, Oliver sent $776.00 with a blank reference. The app marked it ignored and gave no credit. Bank transaction ID: `ec713470-4663-4576-89a6-969a2e8707c8`.

Jay confirmed that this transfer was for rent and that Oliver was not paying $420.00 for the entire period. $776.00 equals two weeks at $388.00. Jay later instructed that the rent was already accounted for manually and that the transfer should not cover other bills. This audit adopts that treatment. The bank receipt is verified; a specific $776.00 manual ledger entry has not been identified.

Every surviving rent charge assigned to Oliver, starting with the week due 24 April 2026, is $420.00. All rent due through 4 September is recorded paid; the only remaining rent is $420.00 due 11 September. Per Jay's instruction, preserve those rent charges and payments for this calculation and make no additional $776.00 credit or inferred historical rate adjustment.

Checked the surviving bill and payment records against the receipt time, 1 May 2026 at 20:35:24 AEST. Twelve of Oliver's debts existed then. Four had matching payment records before the transfer, leaving eight utility shares totalling $745.26: $78.26 gas and $667.00 electricity. This reconstructs the position from current records and their timestamps; deleted bills or historical amount changes cannot be recovered from those records.

None of the 255 combinations of those eight unpaid shares equals $776.00. Including all twelve shares, even those already paid, produces no exact match across 4,095 combinations. Checking the corresponding whole-house bill totals also produces no exact match. The transfer exceeds the reconstructed unpaid total by $30.74.

The absence of an exact match against stored amounts does not contradict Jay's confirmation. Those stored rent amounts all use $420.00, so they cannot establish what Oliver owed during his earlier rental arrangement.

### Two rent transfers likely correspond to existing manual entries

| Bank receipt | Existing manual entry | Assessment |
| --- | --- | --- |
| 29 Apr 2026, $420.00 from Jay, reference Bills for Oliver. ID `ac66fab3-6f07-4c6e-8ded-cb366f050326`. App status unreconciled. | 29 Apr 2026, $420.00 against rent due 24 Apr. ID `manual-admin-Nf4U9ik3WreztVTugdHJh`. | Strong likely link: bank receipt at 11:47:55 and manual entry at 11:54:39, 6 minutes 44 seconds later. No explicit bank link exists. |
| 26 Jun 2026, $420.00 from Oliver, blank reference. ID `37ba4d6e-7ffd-45f0-b649-974bd87a3974`. App status ignored. | 1 Jul 2026, $420.00 against rent due 26 Jun. ID `manual-admin-xLQNHG0qqEz1moXAcsZ6h`. | Likely link by amount, due date, and timing. No explicit bank link exists. |

These two receipts total $840.00. The proposed balance calculations below assume they explain the existing $840.00 of manual rent payments. Crediting them again would count those payments twice if that assumption is correct. Confirm the links and reconcile the records without increasing the paid total.

### The $30.00 manual cleaner payment has no direct bank evidence

The cleaner charge due 22 April is marked paid by a $30.00 manual entry dated 23 April. Its transaction ID is `manual-backfill-Muy8a_7EYWaFG_c_HDOlz` and its metadata says `historical_manual_payment`.

The migration created this entry from a debt that was already marked paid. It is evidence of the app's recorded state, not independent evidence that money arrived. No identifiable incoming Oliver transfer in the connected bank history directly supports it. It may reflect cash, another account, or another settlement. Leave it recorded while checking its source. If it proves erroneous, removing it would increase the balance by $30.00.

## Earlier history and completeness limits

Two older incoming transfers from Jay mention Oliver and remain in the unreconciled queue. Neither appears in `payment_transactions`.

| Received | Amount | Reference | Bank transaction ID |
| --- | --- | --- | --- |
| 19 Jun 2025 | $438.00 | Oliver Capril | `a12841ed-9f56-4c72-9cf2-9f5c31b931b6` |
| 28 Jun 2025 | $428.00 | Oliver Capril | `4e4877e8-b419-4e49-973e-ccc63841d669` |

These total $866.00. They predate every bill currently stored, so they cannot safely be treated as extra credit against the 2026 balance without the earlier charges and settlement history.

There is also a $60.00 outgoing transfer to Oliver on 18 October 2025, reference `IOU`, ID `fd438141-9199-40ed-b059-3e0b63bc83fe`. It is not a payment received from Oliver and has no demonstrated connection to the current bill balance.

The cleaner schedule has a gap: stored charges run 22 April, 6 May, 20 May, 3 June, then 1 July. There is no 17 June charge. A missed service could explain it, so this is not evidence that another $30.00 is owed. It does mean the payment audit cannot establish that every cleaner service was billed.

## Minor split discrepancy

The January AGL Gas bill is $97.45. An exact fifth is $19.49, but Oliver and each other non-owner were charged $19.50. Oliver's share is therefore one cent higher than the exact equal split.

The current rounding helper reproduces the issue: JavaScript calculates `97.45 / 5` as `19.490000000000002`, which the ceiling operation raises to $19.50. All other 36 non-rent shares agree with the current equal-split rule. All 21 rent shares use the current $420.00 custom amount, but their historical correctness remains unverified following Jay's clarification about the earlier rent rate. Correcting this one-cent gas charge would reduce each proposed Oliver balance below by $0.01. No correction was made.

## Balance scenarios

| Scenario | Outstanding | Conditions |
| --- | --- | --- |
| Current app balance | $2,055.87 | Uses the existing bills, allocations, and manual entries. |
| Credit the five labelled household payments | $1,746.87 | Assumes all $309.00 belongs to the current recorded charges and the two $420.00 bank receipts explain the manual rent entries. |
| Correct the January gas split | Subtract $0.01 | Would reduce the working balance to $1,746.86 if the share is separately corrected to $19.49. |

The $776.00 rent transfer and the $866.00 from 2025 are excluded from further credit. The $30.00 historical manual cleaner payment remains included. The earlier $970.87 scenario is withdrawn following Jay's direction to treat the $776.00 as rent already accounted for.

If the $309.00 is applied entirely to overdue bills, overdue debt would fall from $1,465.73 to $1,156.73 and the $590.14 of upcoming charges would stay the same. The actual overdue subtotal depends on the agreed allocation.

## Checks that passed

- Each of Oliver's 30 matched bank payments exists in Up Bank, is settled in AUD, and matches the recorded amount exactly.
- The 33 matched ledger entries sum to $8,874.66, exactly the amount paid across Oliver's debts.
- Each payment's linked debt amounts add up to that payment. All 36 paid debts have a matching ledger entry, and none is linked twice.
- No matched entry refers to a missing debt or a debt belonging to another housemate. Oliver has one debt per recorded bill, with no duplicate assignment.
- Oliver's paid flags agree with his balances. All 58 parent bill statuses agree with the debts stored for those bills.
- No credit was created on Oliver's matched payments, and his stored credit balance is zero.
- All 37 identifiable incoming transfers directly from Oliver are present in the payment ledger. The problem is the status and allocation of some receipts, rather than missing ingestion of those direct transfers.

## Recommended follow-up

1. Identify the bill periods covered by the $309.00 of uncredited household payments and allocate the full amounts, retaining any excess credit.
2. Preserve the existing rent treatment and give no further $776.00 credit, as directed by Jay.
3. Confirm the two $420.00 bank-to-manual rent links and reconcile their statuses without adding the same money again.
4. Verify the source of the $30.00 manual cleaner payment, the 2025 opening balance and $866.00 receipts, and whether a cleaner service occurred on 17 June.
5. Correct the one-cent gas split and review the payment-wording and exact-match rules so valid payments do not remain uncredited.
6. Recalculate the final amount owed after those decisions. The report itself makes no production changes.

## Complete identified receipt history

This table includes all 40 identified incoming transactions, including Jay's three transfers referring to Oliver. Amounts here are bank receipts, not additional credits to apply. All listed receipts are settled.

| Received | Sender | Amount | Reference | Recorded allocation / finding | Bank transaction ID |
| --- | --- | --- | --- | --- | --- |
| 19 Jun 2025 | Jay for Oliver | $438.00 | Oliver Capril | Historical unreconciled queue; no current bill link | `a12841ed-9f56-4c72-9cf2-9f5c31b931b6` |
| 28 Jun 2025 | Jay for Oliver | $428.00 | Oliver Capril | Historical unreconciled queue; no current bill link | `4e4877e8-b419-4e49-973e-ccc63841d669` |
| 29 Apr 2026 | Jay for Oliver | $420.00 | Bills for Oliver | Unreconciled; likely covered by manual rent entry | `ac66fab3-6f07-4c6e-8ded-cb366f050326` |
| 01 May 2026 | Oliver | $420.00 | Rent | Rent due 01 May 2026: $420.00 | `b956583d-e63a-4816-81f7-8d1ac4f07c78` |
| 01 May 2026 | Oliver | $27.80 | Bills | Telstra due 01 May 2026: $27.80 | `1171c85c-4a0f-4675-a1eb-25afe4df587e` |
| 01 May 2026 | Oliver | $776.00 | Blank | Ignored bank record; Jay says rent already accounted for manually; no extra credit | `ec713470-4663-4576-89a6-969a2e8707c8` |
| 07 May 2026 | Oliver | $420.00 | Rent | Rent due 08 May 2026: $420.00 | `4ac7144a-6d61-429c-bc2c-6f34d1016e46` |
| 14 May 2026 | Oliver | $420.00 | Rent | Rent due 15 May 2026: $420.00 | `791dfb52-1dbc-4ba0-aae0-7fccb9a4a600` |
| 14 May 2026 | Oliver | $30.00 | Cleaners | Ignored; no credit | `f10699da-c9ad-4725-929f-22497d502960` |
| 14 May 2026 | Oliver | $199.00 | Gas | Ignored; no credit | `3566c98a-c794-408a-a779-cf158ac6c85d` |
| 21 May 2026 | Oliver | $420.00 | Rent | Rent due 22 May 2026: $420.00 | `7a24c704-911a-44d8-9fb0-016955261be4` |
| 28 May 2026 | Oliver | $450.00 | Rent clean | Cleaners due 06 May 2026: $30.00; Rent due 29 May 2026: $420.00 | `e2b1638e-89bb-479c-8b7d-74d8c05442e4` |
| 05 Jun 2026 | Oliver | $432.50 | Rent Pool | Rent due 05 Jun 2026: $420.00; Pool maintenance due 26 Jun 2026: $12.50 | `00ef9b38-68ea-4113-80e3-6707234294d9` |
| 12 Jun 2026 | Oliver | $420.00 | Rent | Rent due 12 Jun 2026: $420.00 | `4cb5b42d-5e0c-4917-8bb1-22aad7ba7fcf` |
| 19 Jun 2026 | Oliver | $420.00 | Rent | Rent due 19 Jun 2026: $420.00 | `c3e3c697-44f1-4e28-a7a5-e9ab17855ed7` |
| 26 Jun 2026 | Oliver | $420.00 | Blank | Ignored; likely covered by manual rent entry | `37ba4d6e-7ffd-45f0-b649-974bd87a3974` |
| 29 Jun 2026 | Oliver | $30.00 | Cleaners | Ignored; no credit | `c9dbf0fa-e2d5-4923-95bc-69127b8595ef` |
| 03 Jul 2026 | Oliver | $420.00 | Rent | Rent due 03 Jul 2026: $420.00 | `4315a9f8-8113-4cc5-9848-4540e91ef8b5` |
| 10 Jul 2026 | Oliver | $420.00 | Rent | Rent due 10 Jul 2026: $420.00 | `646738ef-32fc-49bc-9749-f349387d937c` |
| 10 Jul 2026 | Oliver | $30.00 | Cleaner | Ignored; no credit | `f41eea4a-ed70-4a11-810e-5754d2f85b21` |
| 10 Jul 2026 | Oliver | $29.17 | Bills | Water due 15 Jun 2026: $29.17 | `aaee90bb-a80c-4dcc-81d7-401ce691f636` |
| 15 Jul 2026 | Oliver | $50.00 | Bills | Pool maintenance due 07 May 2026: $15.00; Neptune Internet due 01 Jul 2026: $35.00 | `90d0e0ab-ac9e-45c2-9673-b14c9cffe927` |
| 17 Jul 2026 | Oliver | $420.00 | Rent | Rent due 17 Jul 2026: $420.00 | `64ebaf88-05ca-4611-ae66-62c3313decf6` |
| 22 Jul 2026 | Oliver | $20.00 | Bills | Unreconciled; no credit | `333442d5-fdfa-4400-8252-25ba44bbc2b1` |
| 23 Jul 2026 | Oliver | $420.00 | Rent | Rent due 24 Jul 2026: $420.00 | `01b255a7-c89b-4d4f-a46a-5fdf0eb7c7e9` |
| 30 Jul 2026 | Oliver | $420.00 | Rent | Rent due 31 Jul 2026: $420.00 | `ac7c7794-3ea9-40f5-8e6f-d1895b67401a` |
| 30 Jul 2026 | Oliver | $30.00 | Bills | Cleaners due 20 May 2026: $30.00 | `b96b940d-c665-4961-968c-95079ad3b13f` |
| 06 Aug 2026 | Oliver | $420.00 | Rent | Rent due 07 Aug 2026: $420.00 | `b95e8e52-59fb-4274-817d-a8d30e20b2c5` |
| 13 Aug 2026 | Oliver | $420.00 | Rent | Rent due 14 Aug 2026: $420.00 | `856323e2-db74-492e-b914-9bb60f8c8fb0` |
| 21 Aug 2026 | Oliver | $420.00 | Rent | Rent due 21 Aug 2026: $420.00 | `b385627f-d528-486b-b6d5-5ea8f65ef1ea` |
| 28 Aug 2026 | Oliver | $420.00 | Rent | Rent due 28 Aug 2026: $420.00 | `d64b3f2a-8e97-4780-b4c8-7dbe68c10896` |
| 31 Aug 2026 | Oliver | $30.00 | Bills | Cleaners due 03 Jun 2026: $30.00 | `22e06657-e120-4e09-bafb-4ff512749bfc` |
| 31 Aug 2026 | Oliver | $15.70 | Bills | Pool maintenance due 31 Aug 2026: $15.70 | `b574379a-e16d-4602-ba1c-6107b0bca5dd` |
| 31 Aug 2026 | Oliver | $27.05 | Bills | Water due 01 Sep 2026: $27.05 | `2d695fba-b645-4976-b7b2-f705f97e66d2` |
| 01 Sep 2026 | Oliver | $30.00 | Bills | Cleaners due 01 Jul 2026: $30.00 | `7bb22fb1-3c57-427a-8047-68a9ba509251` |
| 01 Sep 2026 | Oliver | $27.16 | Bills | AGL Gas due 20 Aug 2026: $27.16 | `2fac98af-3766-4932-9edc-13ca669da5b7` |
| 03 Sep 2026 | Oliver | $420.00 | Rent | Rent due 04 Sep 2026: $420.00 | `3f2dd9ed-f943-4c10-900e-e95c1f0875cb` |
| 08 Sep 2026 | Oliver | $19.50 | Bill | AGL Gas due 21 Jan 2026: $19.50 | `0a199c41-52b1-4ed4-b00e-67dc6a1974d9` |
| 08 Sep 2026 | Oliver | $96.24 | Bill | AGL Electricity due 21 Jan 2026: $96.24 | `6b466be3-2f61-4063-a217-0869ab70aa6e` |
| 08 Sep 2026 | Oliver | $19.54 | Bill | AGL Gas due 20 Feb 2026: $19.54 | `8e5710a8-da1d-4cb1-9e33-0f6af1c86812` |

Receipt totals:

| Month | Receipts | Bank amount |
| --- | --- | --- |
| 2025-06 | 2 | $866.00 |
| 2026-04 | 1 | $420.00 |
| 2026-05 | 9 | $3,162.80 |
| 2026-06 | 5 | $1,722.50 |
| 2026-07 | 10 | $2,259.17 |
| 2026-08 | 7 | $1,752.75 |
| 2026-09 | 6 | $612.44 |
| Total | 40 | $10,795.66 |

Of the $10,795.66 received, $9,509.66 came directly from Oliver and $1,286.00 came from Jay with references to Oliver. The 2026 receipts total $9,929.66. That comprises $8,004.66 already matched automatically, $840.00 likely represented by manual rent entries, $309.00 of uncredited labelled household payments, and $776.00 confirmed by Jay as rent already accounted for manually. The separate $30.00 manual cleaner credit is also retained. Bank receipt totals span older rental arrangements and should not be subtracted wholesale from the current stored charges.

## Manual entry register

These are already included in the $8,874.66 ledger paid total and are not additional bank receipts.

| Recorded date | Amount | Applied to | Ledger transaction ID |
| --- | --- | --- | --- |
| 23 Apr 2026 | $30.00 | Cleaners due 22 Apr 2026 | `manual-backfill-Muy8a_7EYWaFG_c_HDOlz` |
| 29 Apr 2026 | $420.00 | Rent due 24 Apr 2026 | `manual-admin-Nf4U9ik3WreztVTugdHJh` |
| 01 Jul 2026 | $420.00 | Rent due 26 Jun 2026 | `manual-admin-xLQNHG0qqEz1moXAcsZ6h` |

## Full bill and debt register

Amounts below reflect the unchanged live ledger. Bill dates are due dates. `Paid` means credited in the app; it does not independently verify the manual payment source. Longer supplier descriptions are shortened to Rent, Pool maintenance, or Water.

| Due | Bill | Oliver share | Recorded paid | Remaining | Status | Debt ID |
| --- | --- | --- | --- | --- | --- | --- |
| 21 Jan 2026 | AGL Electricity | $96.24 | $96.24 | $0.00 | Paid | `pUFxhSgZs0PV2WYxr7hw8` |
| 21 Jan 2026 | AGL Gas | $19.50 | $19.50 | $0.00 | Paid | `TZtLEb7tjvDRWC2yYd3cq` |
| 20 Feb 2026 | AGL Gas | $19.54 | $19.54 | $0.00 | Paid | `UxY--5bRtOaQqybJRcA0K` |
| 03 Mar 2026 | AGL Electricity | $373.15 | $0.00 | $373.15 | Overdue | `6t0Wuts9AuntAUpwCEGNE` |
| 20 Mar 2026 | AGL Gas | $18.69 | $0.00 | $18.69 | Overdue | `oB9uONTU6ykHJV-ijc3_M` |
| 24 Mar 2026 | AGL Electricity | $99.14 | $0.00 | $99.14 | Overdue | `3BxwdWGZQa-gGOALHTdDJ` |
| 22 Apr 2026 | AGL Gas | $20.53 | $0.00 | $20.53 | Overdue | `KACo2E6IVudRkLPSPhjM-` |
| 22 Apr 2026 | Cleaners | $30.00 | $30.00 | $0.00 | Paid | `Muy8a_7EYWaFG_c_HDOlz` |
| 24 Apr 2026 | AGL Electricity | $98.47 | $0.00 | $98.47 | Overdue | `5HACbBdY46o9KzPW5S-b0` |
| 24 Apr 2026 | Rent | $420.00 | $420.00 | $0.00 | Paid | `VT437e2B2rCuv6rDT-U7z` |
| 01 May 2026 | Rent | $420.00 | $420.00 | $0.00 | Paid | `iV95sXG_Vi2c2VsFAHdwg` |
| 01 May 2026 | Telstra | $27.80 | $27.80 | $0.00 | Paid | `4HDiY5hT6JdbjEMjs4L32` |
| 06 May 2026 | Cleaners | $30.00 | $30.00 | $0.00 | Paid | `jJsOvtLlIOwFWxTD7WtFk` |
| 07 May 2026 | Pool maintenance | $15.00 | $15.00 | $0.00 | Paid | `WbZ71CaYKcUnDKEOitdUD` |
| 08 May 2026 | Rent | $420.00 | $420.00 | $0.00 | Paid | `GrWkvMjAXVDrterKI0se-` |
| 15 May 2026 | Rent | $420.00 | $420.00 | $0.00 | Paid | `HKLVm42buH8yDNDpqE4de` |
| 20 May 2026 | Cleaners | $30.00 | $30.00 | $0.00 | Paid | `48tXw3Lyc3JJUrpNFX8IY` |
| 21 May 2026 | AGL Gas | $26.58 | $0.00 | $26.58 | Overdue | `xOgdoL78Di672OckUPogz` |
| 22 May 2026 | Rent | $420.00 | $420.00 | $0.00 | Paid | `Qw_Dw3tu8mMlpgUdA0lnS` |
| 25 May 2026 | AGL Electricity | $134.62 | $0.00 | $134.62 | Overdue | `V8b2rcux9ArJZbgpw2VF5` |
| 29 May 2026 | Rent | $420.00 | $420.00 | $0.00 | Paid | `y1cm0yIlOz3dFfgASnpQ0` |
| 03 Jun 2026 | Cleaners | $30.00 | $30.00 | $0.00 | Paid | `ZhP-kyvOneElSeqYxXZ98` |
| 05 Jun 2026 | Rent | $420.00 | $420.00 | $0.00 | Paid | `ACx9QS2EVQGCExKKmJ7o6` |
| 12 Jun 2026 | Rent | $420.00 | $420.00 | $0.00 | Paid | `BM8jcSwAraAX-p-_rRdqd` |
| 15 Jun 2026 | Water | $29.17 | $29.17 | $0.00 | Paid | `ABuZGioMd31OfE8CC3reb` |
| 19 Jun 2026 | Rent | $420.00 | $420.00 | $0.00 | Paid | `MzJ-5nC8z0tKwvJfu42D4` |
| 22 Jun 2026 | AGL Gas | $29.63 | $0.00 | $29.63 | Overdue | `Y_GnwsvQEUsYXESW3EyPT` |
| 24 Jun 2026 | AGL Electricity | $125.09 | $0.00 | $125.09 | Overdue | `w9BEgvO_D6l55DAHPxRyF` |
| 26 Jun 2026 | Rent | $420.00 | $420.00 | $0.00 | Paid | `Y3m8YDOr5iFtSt7Q5KAK2` |
| 26 Jun 2026 | Pool maintenance | $12.50 | $12.50 | $0.00 | Paid | `ldGX295AXMVPlb40gZIOy` |
| 01 Jul 2026 | Cleaners | $30.00 | $30.00 | $0.00 | Paid | `CEv1CV-kJgoZnzLnNQZOd` |
| 01 Jul 2026 | Neptune Internet | $35.00 | $35.00 | $0.00 | Paid | `NdNgtauHXQ7QguIvz0eeN` |
| 03 Jul 2026 | Rent | $420.00 | $420.00 | $0.00 | Paid | `noIvpLhMQrOGrYeHmWhSn` |
| 10 Jul 2026 | Rent | $420.00 | $420.00 | $0.00 | Paid | `mRC2jkwyfmI1y-xZRu5xX` |
| 15 Jul 2026 | Cleaners | $30.00 | $0.00 | $30.00 | Overdue | `Iw6Kt5As4L-wEdccr_z4e` |
| 17 Jul 2026 | Rent | $420.00 | $420.00 | $0.00 | Paid | `8skCRe_n-VMIaksCTzWRd` |
| 21 Jul 2026 | AGL Gas | $12.16 | $0.00 | $12.16 | Overdue | `vhx90FHEIuHCp3dOrf8PR` |
| 23 Jul 2026 | AGL Electricity | $190.05 | $0.00 | $190.05 | Overdue | `5Kr0PSoObfuHVMw0ayZE8` |
| 24 Jul 2026 | Rent | $420.00 | $420.00 | $0.00 | Paid | `5Q8d92yKG_nmhy-P7T4S0` |
| 24 Jul 2026 | Pool maintenance | $12.50 | $0.00 | $12.50 | Overdue | `nUK9Yfp01bNvYz-6t5DD9` |
| 29 Jul 2026 | Cleaners | $30.00 | $0.00 | $30.00 | Overdue | `s5ELj_uQVKOykPn6LnL6X` |
| 31 Jul 2026 | Rent | $420.00 | $420.00 | $0.00 | Paid | `P_r7LF25wALs672hK6N-y` |
| 07 Aug 2026 | Rent | $420.00 | $420.00 | $0.00 | Paid | `-0DNLRR0rreIJblr_Cs2I` |
| 12 Aug 2026 | Cleaners | $30.00 | $0.00 | $30.00 | Overdue | `rYfQDQF_pTHbGxOpmGQtY` |
| 14 Aug 2026 | Rent | $420.00 | $420.00 | $0.00 | Paid | `7XJjtv1gr9tvchWMviv3k` |
| 20 Aug 2026 | AGL Gas | $27.16 | $27.16 | $0.00 | Paid | `ablVcuUeGMFJ9K4yv3BEt` |
| 21 Aug 2026 | Rent | $420.00 | $420.00 | $0.00 | Paid | `U7KiNN0y-ARJ9M9YgiywD` |
| 24 Aug 2026 | AGL Electricity | $205.12 | $0.00 | $205.12 | Overdue | `9G_t9HK5iSlu6QiFLfAk8` |
| 26 Aug 2026 | Cleaners | $30.00 | $0.00 | $30.00 | Overdue | `FyObhJLlyKFu7kpdVHXrd` |
| 28 Aug 2026 | Rent | $420.00 | $420.00 | $0.00 | Paid | `Hjik2ZaMo4euBq_T31ErY` |
| 31 Aug 2026 | Pool maintenance | $15.70 | $15.70 | $0.00 | Paid | `r2-oU5VPvOf-3Qc1-12LM` |
| 01 Sep 2026 | Water | $27.05 | $27.05 | $0.00 | Paid | `wV7Rqz4wiE7FxBF0XUmlv` |
| 04 Sep 2026 | Rent | $420.00 | $420.00 | $0.00 | Paid | `5YJhsDj0MVzDz0FX4-m-3` |
| 09 Sep 2026 | Cleaners | $30.00 | $0.00 | $30.00 | Upcoming | `0GOBWIVzV_mKlChFQI93q` |
| 11 Sep 2026 | Rent | $420.00 | $0.00 | $420.00 | Upcoming | `BujEVNYBfbeq8wWqao1aH` |
| 18 Sep 2026 | AGL Gas | $21.41 | $0.00 | $21.41 | Upcoming | `QvhN-tDCzoE5p1UVVvF9l` |
| 22 Sep 2026 | AGL Electricity | $106.23 | $0.00 | $106.23 | Upcoming | `Ckfea6tXQ43Q1NqFAO3p1` |
| 24 Sep 2026 | Pool maintenance | $12.50 | $0.00 | $12.50 | Upcoming | `FQJKrVKfEcAv9t8aFQnVm` |

## Source references

Database evidence came from `housemates`, `payment_transactions`, `unreconciled_transactions`, `debts`, `bills`, `recurringBills`, and `recurringBillAssignments`, using SELECT queries in read batches. Oliver's housemate ID is `d_reLiN6MKMk9IrhaYp1W`. Bank evidence came from authenticated GET requests to `https://api.up.com.au/api/v1/transactions`, following every returned next-page link.

The following local source files explain the current application behaviour. They were read for this audit, not changed:

- [Payment reconciliation](/Users/j/Dev/sharehouse-bills/src/api/services/payment-reconciliation.ts:107), billing keywords, ignored transactions, and exact-amount matching.
- [Debt and credit calculations](/Users/j/Dev/sharehouse-bills/src/api/services/debt-payment-state.ts:12).
- [Recent payments query](/Users/j/Dev/sharehouse-bills/src/functions/payments.ts:12), limited to 50 payments in the UI.
- [Manual payment recording](/Users/j/Dev/sharehouse-bills/src/functions/bills.ts:32).
- [Historical manual-payment backfill](/Users/j/Dev/sharehouse-bills/src/api/db/migrations/0007_calm_hobgoblin.sql:16).
- [Equal-split rounding](/Users/j/Dev/sharehouse-bills/src/lib/equal-split.ts:5).

The ledger is the live evidence for recorded outcomes. Local source behaviour explains those outcomes but is not proof of which code revision processed each historical payment.
