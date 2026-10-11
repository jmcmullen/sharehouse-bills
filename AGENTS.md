# Repository Guidelines

## Project Structure & Module Organization
This is a single TanStack Start app under `src/`. `src/routes` holds file-based routes: admin pages (`_app.bills.tsx`, `_app.housemates.tsx`, `_app.ledger.tsx` for Accounts, `_app.payment-review.tsx`, `_app.recurring-bills.tsx`), public pages (`bill.$pdfSha256.tsx`, `pay.$token.tsx`, `receipt.$token.tsx`), and API handlers (`api.hooks.up.ts`, `api.hooks.email.ts`, `api.hooks.whatsapp.ts`, `api.cron.ts`). Server functions live in `src/functions` (`ledger.ts`, `bills.ts`, `bill-verification.ts`, `housemates.ts`, `recurring-bills.ts`). Domain logic lives in `src/api/services`: `account/` derives every money figure and `payments/` handles bank ingest, admin decisions, allocations and cash. Drizzle schema is in `src/api/db/schema`, migrations in `src/api/db/migrations`, and scripts in `src/api/scripts`. UI lives in `src/components` (feature folders plus shadcn primitives in `ui/`). WhatsApp delivery workflows are in `workflows/`. `docs/payments.md` describes the payments model.

## Build, Test, and Development Commands
Use Bun for everything; never npm or yarn.

- `bun dev`: start the app on `http://localhost:4000`.
- `bun test`: run the test suite with Bun's built-in runner.
- `bun typecheck`: run TypeScript without emitting files.
- `bun check`: run Biome formatting, linting, and import organization.
- `bun fallow`: check for dead code and duplication.
- `bun run build` / `bun serve`: build and preview production.
- `bun db:generate` / `bun db:migrate`: generate and apply migrations.
- `bun db:push`, `bun db:studio`, `bun db:seed`: schema push, Drizzle Studio, local seed data.
- `bun ledger`: import Up history (`--import-up`, `--bank-file`) or write an account report (`--report`).

## Coding Style & Naming Conventions
TypeScript, functional style, no classes. Biome formats with tabs and double quotes. React components in PascalCase, hooks as `use-*.ts`, directories and service/schema files in kebab-case. Do not edit `src/routeTree.gen.ts`.

All money is integer cents with no tolerances. Only `src/api/services/account` derives paid, remaining, credit, owed, overdue or balance; other code reads the account loaders. Nothing credits or allocates money automatically: receipts come from an admin decision or recorded cash.

## Testing Guidelines
Tests sit in a `tests/` folder beside the code as `*.test.ts` or `*.test.tsx` and run with `bun test`. Payments and account tests use `src/api/services/payments/tests/fixture.ts`, which pushes the current schema to a temporary SQLite file. Every change keeps `bun test`, `bun typecheck` and `bun check` green; the pre-commit hook runs `fallow`, `check` and `typecheck`.

## Commit & Pull Request Guidelines
Use Conventional Commit prefixes (`feat:`, `fix:`, `refactor:`, `docs:`) with short imperative subjects. PRs explain the user-facing change, note schema or environment variable updates, and include screenshots for UI changes. Call out webhook, auth, payments or migration risks explicitly.

## Security & Configuration Tips
Secrets live in `.env`; start from `.env.example` and never commit real credentials. Take care with Turso, Better Auth, Up Bank, Resend, WAHA and Google Vertex keys. Never run migrations against the live database without a backup and a local rehearsal (see `docs/payments.md`).
