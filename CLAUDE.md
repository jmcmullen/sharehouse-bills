# CLAUDE.md

You are an expert in TypeScript, Node.js, TanstackStart Server Functions, React, Shadcn UI, Radix UI and Tailwind.

Code Style and Structure

- Write concise, technical TypeScript code with accurate examples.
- Use functional and declarative programming patterns; avoid classes.
- Prefer iteration and modularization over code duplication.
- Use descriptive variable names with auxiliary verbs (e.g., isLoading, hasError).
- Structure files: exported component, subcomponents, helpers, static content, types.

Naming Conventions

- Use lowercase with dashes for directories (e.g., components/auth-wizard).
- Favor named exports for components.

TypeScript Usage

- Use TypeScript for all code; prefer interfaces over types.
- Avoid enums; use maps instead.
- Use functional components with TypeScript interfaces.

Syntax and Formatting

- Use the "function" keyword for pure functions.
- Avoid unnecessary curly braces in conditionals; use concise syntax for simple statements.
- Use declarative JSX.

UI and Styling

- Use Shadcn UI, Radix, and Tailwind for components and styling.
- Implement responsive design with Tailwind CSS; use a mobile-first approach.
- Use Shadcn UI design tokens instead of adding custom colours to components.

Performance Optimization

- Minimize client side components and prefer server functions.
- Wrap client components in Suspense with fallback.
- Use dynamic loading for non-critical components.
- Prefer server-side data loading with route loaders over client-side fetching.

Key Conventions

- Use 'nuqs' for URL search parameter state management.
- Optimize Web Vitals (LCP, CLS, FID).
- Limit 'use client':
  - Favor server components and Tanstack Start SSR.
  - Use only for Web API access in small components.
  - Avoid for data fetching or state management.

Follow Tanstack Start docs for Data Fetching, Rendering, and Routing.

## Modern Data Loading Patterns

### Server-Side Data Loading (Preferred)

Use TanStack Router loaders for initial data:

```typescript
// Route with loader
export const Route = createFileRoute("/bills")({
  loader: async () => {
    const billsData = await getAllBills();
    return { billsData };
  },
  component: BillsPage,
});

// Component using loader data
function BillsPage() {
  const { billsData } = useLoaderData({ from: "/bills" });
  // No loading states needed - data is available immediately
}
```

### Suspense Boundaries

Wrap route outlets in Suspense for loading UI:

```typescript
// Root layout with Suspense
<Suspense fallback={<PageSkeleton />}>
  <Outlet />
</Suspense>
```

### Mutations with Router Invalidation

For data mutations, use router invalidation instead of manual refetching:

```typescript
function handleDelete() {
  startTransition(async () => {
    await deleteBillAction(billId);
    router.invalidate(); // Refreshes all route loaders
    toast.success("Deleted successfully");
  });
}
```

### Context-Based Data Sharing

Access root loader data from child components:

```typescript
// Access session from root context
const routerState = useRouterState();
const session = routerState.matches[0]?.context?.session;
```

### Custom Hooks for UI State Only

Limit custom hooks to UI state management, not data fetching:

```typescript
// ✅ Good - UI state management
function useBillModals() {
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  // Modal state management only
}

// ❌ Avoid - data fetching in hooks
function useBillsData() {
  const [data, setData] = useState();
  useEffect(() => fetchData(), []); // Use route loaders instead
}
```

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
- **Server-Side Data Loading**: Route loaders fetch data on server, eliminating loading states
- **Router Context Sharing**: Session and global data shared via router context
- **Suspense-First Loading**: Use Suspense boundaries instead of manual loading states
- **Router Invalidation**: Mutations trigger automatic data refresh via router.invalidate()
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
