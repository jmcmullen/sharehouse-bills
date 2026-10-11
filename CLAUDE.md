# CLAUDE.md

Sharehouse Bills: a single TanStack Start app (React 19, Vite, Nitro) with
Drizzle on SQLite/Turso, Better Auth, shadcn/ui and Tailwind 4. Bills become
per-housemate shares, Up Bank transfers wait for an admin decision, and
WhatsApp (WAHA) carries the messages. See README.md for features and
docs/payments.md for the money model.

## Layout

- `src/routes/` - file-based routes: admin pages under `_app.*`, public pages
  (`bill.$pdfSha256`, `pay.$token`, `receipt.$token`), and API handlers
  (`api.hooks.up`, `api.hooks.email`, `api.hooks.whatsapp`, `api.cron`,
  `api.cards.*`). `src/routeTree.gen.ts` is generated; never edit it.
- `src/functions/` - TanStack Start server functions, protected with
  `authMiddleware` (`ledger.ts`, `bills.ts`, `bill-verification.ts`,
  `housemates.ts`, `recurring-bills.ts`, public page loaders).
- `src/api/services/account/` - every money derivation.
- `src/api/services/payments/` - bank ingest, admin decisions, allocations,
  cash, suggestions, receipt and arrival notifications.
- `src/api/services/` - bill parsing, recurring bills, WhatsApp composition and
  the assistant.
- `src/api/db/schema/` - Drizzle tables; `src/api/db/migrations/` - SQL
  migrations.
- `src/api/scripts/` - `migrate.ts`, `test-seed.ts`, `ledger.ts` (the
  `bun ledger` CLI), `verify-receipts-migration.ts`.
- `src/components/` - feature folders (`bills`, `housemates`, `ledger`,
  `public`, `recurring-bills`) and shadcn primitives in `ui/`.
- `workflows/` - durable, retryable WhatsApp delivery workflows.

## Commands

- `bun dev` - start the app on http://localhost:4000
- `bun test` - run the tests (Bun's built-in runner; no script needed)
- `bun typecheck` - TypeScript, no emit
- `bun check` - Biome format, lint and import sorting (writes fixes)
- `bun fallow` - dead code and duplication check
- `bun run build` - production build
- `bun db:generate` / `bun db:migrate` - generate and apply migrations
- `bun db:push`, `bun db:studio`, `bun db:seed`
- `bun ledger --import-up | --bank-file file.json | --report file.json`

Keep `bun test`, `bun typecheck` and `bun check` green. The pre-commit hook
runs `fallow`, `check` and `typecheck`. Use bun, never npm or yarn.

## Money rules

- All money is integer cents (`amount_cents`, `total_cents`). No floats, no
  tolerances. Format with `src/lib/money.ts`.
- Only `src/api/services/account/` derives paid, remaining, credit, owed,
  overdue or balance. Everything else reads `loadAccount`, `loadAccounts`,
  `loadBill` or `loadBills` and never sums amounts itself.
- Nothing credits or allocates money automatically. Receipts come from an admin
  decision on a bank transaction or from recording cash.

## Code style

- TypeScript everywhere, functional and declarative; no classes. Prefer
  interfaces over types and maps over enums.
- Biome: tabs and double quotes. Run `bun check`.
- Use the `function` keyword for pure functions; named exports for components.
- Lowercase-with-dashes for directories and service files; PascalCase
  components; hooks as `use-*.ts`.
- Validate inputs with zod at server function and service boundaries.
- Tests live in a `tests/` folder next to the code as `*.test.ts(x)`. Payments
  tests use the fixture in `src/api/services/payments/tests/fixture.ts`, which
  pushes the current schema to a temp SQLite file.

## UI

- shadcn/ui, Radix and Tailwind; use the design tokens, not custom colours.
- Mobile first.

## Data loading

Load data in route loaders through server functions, not in client effects:

```typescript
export const Route = createFileRoute("/_app/bills")({
	loader: async () => ({ bills: await getAllBills() }),
	component: BillsPage,
});
```

- Wrap outlets in `Suspense` with a fallback instead of manual loading state.
- After a mutation, call `router.invalidate()` to refresh loaders rather than
  refetching by hand.
- Custom hooks hold UI state only, never data fetching.
