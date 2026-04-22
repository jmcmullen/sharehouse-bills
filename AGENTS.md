# Repository Guidelines

## Project Structure & Module Organization
`src/routes` contains TanStack Start routes, including UI pages such as `bills.tsx` and API handlers like `api.up-webhook.ts`. Shared server actions live in `src/functions`, while domain logic and integrations live under `src/api/services`. Database access is in `src/api/db` with Drizzle schema files in `src/api/db/schema`. Reusable UI lives in `src/components`, with feature folders for `bills`, `housemates`, and base primitives in `src/components/ui`. Static assets are in `public`, and project notes/screenshots are in `docs`.

## Build, Test, and Development Commands
Use Bun for all package scripts.

- `bun dev`: start the app locally on `http://localhost:3001`.
- `bun build`: create a production build with Vite.
- `bun serve`: preview the production build locally.
- `bun typecheck`: run TypeScript without emitting files.
- `bun check`: run Biome formatting, linting, and import organization.
- `bun db:push`: push the current Drizzle schema to the database.
- `bun db:generate` / `bun db:migrate`: generate and apply migrations.
- `bun db:studio`: inspect the database in Drizzle Studio.
- `bun db:seed`: seed local data from `src/api/scripts/test-seed.ts`.

## Coding Style & Naming Conventions
The codebase is TypeScript-first and uses Biome. Formatting uses tabs and double quotes; run `bun check` before opening a PR. Follow existing naming patterns: React components in PascalCase files, hooks as `use-*.ts`, route files aligned to TanStack conventions, and service/schema files in kebab-case. Do not edit generated artifacts such as `src/routeTree.gen.ts` by hand.

## Testing Guidelines
There is no dedicated `bun test` script in this repository yet. For now, every change should pass `bun typecheck` and `bun check`. For UI or workflow changes, manually verify the affected route locally, especially bill creation, housemate updates, auth, and webhook-related flows. If you add automated tests, keep them close to the feature and use clear names such as `bills-page.test.tsx`.

## Commit & Pull Request Guidelines
Recent history uses concise Conventional Commit prefixes such as `fix:`, `feat:`, and `refactor:`. Keep subjects short and imperative, for example `fix: up webhook`. PRs should explain the user-facing change, note any schema or environment variable updates, and include screenshots for UI changes. Call out webhook, auth, or database risks explicitly so reviewers can validate them quickly.

## Security & Configuration Tips
Secrets live in `.env`; start from `.env.example` and never commit real credentials. Pay special attention to SendGrid, Better Auth, Google AI/Vertex, Turso, and Up Bank keys when testing integrations.
