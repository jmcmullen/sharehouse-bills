# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development

- `bun dev` - Start the web application with API routes (port 3001)
- `bun dev:web` - Start only the web application (port 3001)

### Database

- `cd packages/api && bun db:local` - Start local SQLite database (run once for initial setup)
- `bun db:push` - Push schema changes to database
- `bun db:studio` - Open Drizzle Studio for database management
- `bun db:generate` - Generate database migrations
- `bun db:migrate` - Run database migrations

### Code Quality

- `bun check` - Run Biome formatting and linting
- `bun typecheck` - Check TypeScript types across all apps
- `bun build` - Build all applications

### Testing

- `cd apps/web && bun test` - Run web app tests
- `cd apps/web && bun test:ui` - Run tests with UI
- `cd apps/web && bun coverage` - Run tests with coverage

## Architecture

This is a TypeScript monorepo using the Better-T-Stack with end-to-end type safety:

### Frontend & API (`/apps/web`)

- **TanStack Start**: Full-stack SSR framework serving both UI and API routes
- **React 19**: UI library with shadcn/ui components
- **TailwindCSS v4**: Styling framework
- **ORPC Client**: Type-safe API calls
- **Better Auth**: Authentication client
- **API Routes**: Served via TanStack Start at `/api/*`

### API Package (`/packages/api`)

- **Just-in-Time Package**: TypeScript compiled by the consuming application
- **ORPC Server**: End-to-end type-safe API layer with protected/public procedures
- **Drizzle ORM**: Type-safe database access with SQLite/Turso
- **Better Auth**: Session-based authentication
- **AI Integration**: Google Gemini 1.5 Flash for AI features

### Key Architectural Patterns

- **Type-Safe API**: ORPC provides end-to-end type safety between frontend and API
- **Authentication**: Protected procedures require valid session, enforced at the ORPC layer
- **Database Schema**: Defined in `/packages/api/src/db/schema.ts` using Drizzle ORM
- **API Routers**: Modular structure in `/packages/api/src/routers/`
- **Frontend Routes**: File-based routing in `/apps/web/src/routes/`
- **API Routes**: TanStack Start serves API at `/api/*` with a catch-all route handler

### Environment Setup

- Web app requires (in `apps/web/.env`):
  - `DATABASE_URL`, `DATABASE_AUTH_TOKEN` (Turso database)
  - `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (Authentication)
  - `GOOGLE_GENERATIVE_AI_API_KEY` (AI features)
  - Additional keys for Twilio, OpenAI, Up Bank as needed

### Code Style

- Formatter: Biome with tabs and double quotes
- Import sorting: Enabled with Biome
- Pre-commit hooks: Automatically runs formatting on staged files
