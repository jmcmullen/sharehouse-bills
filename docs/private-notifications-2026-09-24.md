# Private WhatsApp notifications

Decided 24 September 2026.

## Policy

Housemates get two kinds of private WhatsApp message, and nothing else:

1. **One daily overdue digest** per housemate, only on days something is overdue.
2. **One receipt per confirmed payment** (`payment_receipt`, or `payment_correction` when an admin changes what a payment covered), naming the bills it covered.

The group chat keeps `bill_created` and `bill_paid` exactly as before. Admin-only messages (`payment_arrived`, the `/due` family of commands, the assistant) are unchanged.

Retired: per-bill reminders (pre-due and overdue, individual and stacked), their per-bill settings, and the per-share `debt_paid` receipt link. Per-bill reminders had reached up to 20 private messages a day per person.

## Daily overdue digest

- `/api/cron` runs at 00:00 UTC (10am Sydney). After generating recurring bills it calls `enqueueOverdueDigests(now)` (`whatsapp-notification-events.ts`).
- Recipients are non-owner housemates with a WhatsApp number. Each housemate's unpaid shares come from `getCoveredShares`, the same query the pay page uses, with held credit applied oldest due first (`coverShares`).
- `buildOverdueDigest` (`overdue-digest.ts`) keeps the shares still owing after credit whose due date falls before today in Australia/Sydney. Nothing overdue means no row and no message.
- Each digest is one `whatsapp_notifications` row, event type `overdue_digest`, event key `overdue-digest:<housemateId>:<YYYY-MM-DD>` (Sydney date). The key is unique, so rerunning the cron the same day finds the existing row and never sends twice.
- `workflows/overdue-digest.ts` recomputes the digest when it sends. If a payment has since covered everything it marks the row `ignored`.
- The message (`buildOverdueDigestSummary`): greeting by first name, overdue total, one line per bill oldest first (`AGL Electricity · $205.12 · 31 days overdue`), at most 8 lines then `+N more`, `$50.00 of your credit is already applied.` when credit went to overdue bills, and the housemate's all-bills pay link. Upcoming bills are never mentioned.
- The admin `/reminder` command previews today's digests: a summary of who would get one and for how much, followed by each exact message. Nothing is sent to housemates.

## Migration 0019 `overdue_digest`

1. Drops `reminders_enabled`, `reminder_mode`, `pre_due_offsets_days`, `overdue_cadence` and `overdue_weekday` from `bills`, and the same five columns from `recurringBills`.
2. Keeps `stack_group` / `stackGroup`: the bills page uses it to share one pay link across a group, the pay page has a group scope, and the ledger falls back to it as a bill category. Parsed electricity and gas bills still default to `utilities`; recurring templates copy their group to generated bills.
3. Marks any `bill_reminder` or `debt_paid` rows still `pending` or `failed` as `ignored`, so nothing held back is ever sent. Completed and ignored history is untouched.

The `bill_reminder` and `debt_paid` values stay in the Drizzle enum for `event_type` because historical rows still carry them; nothing creates them any more.
