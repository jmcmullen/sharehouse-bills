# Payments and bill allocations

The housemate account now opens with bills, their paid amounts and what remains. Expanding a bill shows the receipts covering it. Money received is a separate tab, with each matched transfer shown once and its bill allocations underneath.

A manual record confirms money received. Its bills remain paid while the bank match is pending. A bank transfer can confirm several manual records, provided they belong to the same housemate and total the transfer exactly. A manual record cannot verify two transfers. The original journal entries remain available under the collapsed journal view.

## Live migration

Migrations `0013_payment_bill_allocations` and `0014_allocation_review_decisions` were applied after a local rehearsal and a private backup.

- Restored **180 payment-to-bill allocations**.
- Preserved all **19 manual payments** and their original bill assignments.
- Every bill's allocated paid amount agrees with its legacy paid amount.
- All balances, existing journal entries, source records and bank decisions are unchanged.
- All seven legacy financial tables are unchanged, and no migration events remain pending.

Private backups, the rehearsal, reports and before/after verification are under `/private/tmp/oliver-payment-audit/bill-allocations-*`.

## Matching and double counting

Needs attention also identifies possible matches among bank payments already credited. These are suggestions, not established duplicates. In the verified snapshot, there are 7 held payments and 18 already credited transfers with possible manual matches.

Matching a held transfer confirms the manual money without adding credit. Matching an already credited transfer removes that bank credit while retaining the manually recorded money and bill allocations. Confirm that the money is the same before matching. For distinct payments, confirm they are separate and give a note; that decision survives reimports.

The matcher supports combinations of manual records and allows for bills marked paid long after the bank transfer. Dates rank the choices rather than imposing the former 14-day upper limit. Existing bank credits are not withdrawn merely because a potential match is found.

Recording a new receipt checks for an existing amount near its received date. A possible repeat requires confirmation that it is additional money. Requests reject stale state, preventing accidental repeats on retries.

## Allocations and dates

Choose bills from an existing receipt to allocate money without creating another payment. Allocations cannot exceed either the receipt or the housemate's remaining bill share. Rent-only receipts can cover rent bills. Excess money remains unallocated. Allocation changes have an audit history and survive subsequent legacy backfills, including deliberate removal of an allocation.

The screen distinguishes the bank received date from the date a manual payment was recorded. When the historical received date is unknown, it is labelled as a recorded date. Housemates' private statements include their bills and receipts without exposing raw bank evidence or other housemates' records.

## Verification and user testing

All 32 ledger tests, TypeScript, Biome, Fallow and the production build passed. Tests cover combined payments, late manual recording, repeated imports, duplicate-credit corrections, payment reuse, changed evidence, partial allocations, retained credit, stale edits and private statement isolation. A version 3 snapshot export/import passed complete read-back verification, including allocation history.

Browser testing is left to the user. The application changes are local, not committed or deployed. Existing legacy bill pages and reminders remain in place during reconciliation.

To test locally:

1. Open `/ledger`, select a housemate and expand a paid bill. Check its receipt and dates.
2. Open Money received and inspect its bills and unallocated amount.
3. Open Payment review. For an actual match, select the manual records covered by the transfer and check their total before confirming. Matching an already credited transfer intentionally removes the duplicate credit.
4. Open a housemate's statement from their pay link (**View statement**) and check that the same bill payment information appears.
