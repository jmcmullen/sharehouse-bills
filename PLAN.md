# PLAN.md

## Milestone 0: Project Setup & Configuration
Goal: Prepare the development environment, install all dependencies, and connect to external services.

### ✅ Project Architecture - Simplified Single Package
The project has been refactored to use a simplified architecture:
- **Single Package**: Everything consolidated into root directory (no more monorepo)
- **Frontend & API**: TanStack Start with React 19 serving both UI and server functions
- **Database**: Drizzle ORM with SQLite/Turso (co-located in `/src/api/db/`)
- **Authentication**: Better Auth (in `/src/api/lib/auth.ts`)
- **Server Functions**: Direct TanStack Start server functions (in `/src/functions/`)

### Install Dependencies

Install necessary packages in the root:
```bash
# AI processing
bun add @google/generative-ai

# Email processing
bun add @libsql/client drizzle-orm
bun add -D drizzle-kit
```

### Set Up Environment Variables

Update the `.env` file in the root with these keys:
```env
# Database
DATABASE_URL="your-turso-database-url"
DATABASE_AUTH_TOKEN="your-turso-auth-token"

# Authentication
BETTER_AUTH_SECRET="your-auth-secret"
BETTER_AUTH_URL="http://localhost:3001"

# AI Processing
GOOGLE_GENERATIVE_AI_API_KEY="your-gemini-api-key"

# Email (optional for manual uploads)
TWILIO_ACCOUNT_SID="your-twilio-account-sid"
TWILIO_AUTH_TOKEN="your-twilio-auth-token"

# Up Bank API (optional)
UP_BANK_API_TOKEN="your-up-bank-personal-access-token"

# Webhook Security
WEBHOOK_SECRET="generate-a-strong-random-string-here"
```

### Update Database Schema

1. Schema files are now located at `src/api/db/schema/`
2. Push schema changes to database:
```bash
bun db:push
```

## Milestone 1: Database Schema & Core Server Functions
Goal: Set up the database schema and core server functions for bills management.

### ✅ Database Schema Already Created

The bills management schema is implemented in `src/api/db/schema/`:
- ✅ `bills.ts` - Bills table with biller info, amounts, due dates
- ✅ `housemates.ts` - Housemates table with names and payment details  
- ✅ `debts.ts` - Individual debt records linking bills to housemates
- ✅ `recurringBills.ts` - Recurring bill templates (rent, utilities)
- ✅ `recurringBillAssignments.ts` - Housemate assignments for recurring bills

### ✅ Server Functions Already Created

The core server functions are implemented in `src/functions/`:

1. ✅ `src/functions/bills.ts`:
   - ✅ `getAllBills` - Fetch all bills with related debts
   - ✅ `createBill` - Create new bills
   - ✅ `deleteBill` - Delete bills and associated debts
   - ✅ `markDebtPaid` - Mark individual debts as paid
   - ✅ `generateWeeklyRent` - Generate recurring rent bills

2. ✅ `src/functions/housemates.ts`:
   - ✅ `getAllHousemates` - Get all housemate records
   - ✅ `createHousemate` - Add new housemate
   - ✅ `updateHousemate` - Update housemate details
   - ✅ `deactivateHousemate` - Soft delete housemate

3. ✅ `src/functions/todo.ts`:
   - ✅ Basic todo functionality for testing

## Milestone 2: Email Ingestion & AI Parsing
Goal: Create webhook endpoint for email processing, parse PDFs with AI, and create bill records.

### ✅ Email Webhook Endpoint Created

The webhook endpoint is implemented at `src/routes/api.email-webhook.ts`:
- Handles multipart form data from email services
- Extracts PDF attachments
- Processes bills using AI parsing service
- Sends email notifications with results

### ✅ AI Processing with Google Gemini

The AI parsing is implemented in `src/api/services/ai-parser.ts`:
```typescript
// Uses Google Gemini 1.5 Flash for PDF parsing
const result = await model.generateContent([
  "Extract bill details from this PDF...",
  {
    inlineData: {
      mimeType: "application/pdf",
      data: pdfBase64
    }
  }
]);
```

### ✅ Bill Processing Service

The complete processing pipeline is in `src/api/services/bill-processor.ts`:
1. Extract PDF from email attachment
2. Parse bill details with AI
3. Create bill and debt records
4. Send notification emails

## Milestone 3: Recurring Bill Automation
Goal: Implement automated recurring bill creation system for rent and other recurring expenses.

### ✅ Recurring Bill Service Created

The service is implemented in `src/api/services/recurringBillService.ts`:
```typescript
// Generates bills from recurring templates
export class RecurringBillService {
  static async generateDueBills(targetDate?: Date)
  static async generateWeeklyRentBill()
  static getNextThursday(fromDate?: Date)
}
```

### ✅ Cron Job Integration

Cron endpoint implemented at `src/routes/api.cron.generate-bills.ts`:
- Daily check for due recurring bills
- Automatic generation based on schedule
- Manual trigger capability

### Weekly Rent Configuration
- **Amount**: $1890.00 weekly
- **Schedule**: Every Thursday
- **Splitting**: Equal division among active housemates
- **Automation**: Fully automated with manual override

## Milestone 4: Up Bank Payment Reconciliation Engine ✅
Goal: Create webhook for Up Bank transactions and implement smart payment reconciliation.

### ✅ Transaction Webhook Implementation

1. **Up Bank webhook endpoint** implemented at `src/routes/api.up-webhook.ts`:
   - **Security**: HMAC SHA-256 signature verification using `UP_BANK_WEBHOOK_SECRET`
   - **Event filtering**: Only processes `TRANSACTION_SETTLED` events to avoid duplicates
   - **Transaction validation**: Only processes incoming transactions (positive amounts)
   - **Error handling**: Comprehensive error responses and logging

### ✅ Smart Payment Reconciliation Service

**Payment reconciliation service** (`src/api/services/payment-reconciliation.ts`):

1. **Reconciliation algorithms implemented:**
   - **Exact match with tolerance**: Match transaction amount to single debt (±1¢ tolerance for rounding)
   - **Combination match**: Find multiple debts that sum to transaction amount (up to 3 debts)
   - **Fuzzy matching**: 1¢ tolerance handles rounding discrepancies
   - **Housemate identification**: Match by bank alias or name in transaction description

2. **Core functions:**
```typescript
export async function processTransaction(transaction: UpBankTransaction): Promise<ReconciliationResult>
export async function findExactMatches(amount: number, housemateId?: number | null): Promise<Debt[]>
export async function findCombinationMatches(amount: number, housemateId?: number | null): Promise<Debt[][]>
export async function identifyHousemate(transaction: UpBankTransaction): Promise<number | null>
export async function markDebtsAsPaid(debtsToMark: Debt[]): Promise<void>
export async function storeUnreconciledTransaction(transaction, reason): Promise<void>
export async function manuallyReconcileTransaction(transactionId: string, debtIds: number[]): Promise<ReconciliationResult>
```

### ✅ Unmatched Transaction Handling

1. **unreconciledTransactions table** (already existed):
   - Stores failed transaction matches with reasons (`no_match`, `ambiguous_match`, `insufficient_data`)
   - Includes full transaction data for debugging
   - Prevents duplicate processing with transaction ID tracking

2. **Manual reconciliation capability:**
   - `getUnreconciledTransactions()` - Retrieve all unmatched transactions
   - `manuallyReconcileTransaction()` - Manually assign transactions to specific debts
   - Automatic cleanup when manual reconciliation is successful

### ✅ Integration Points

1. **Environment variables configured:**
```env
# Up Bank API Integration
UP_BANK_API_TOKEN="your-up-bank-personal-access-token"
UP_BANK_WEBHOOK_SECRET="your-webhook-secret"
```

2. **Webhook URL for Up Bank:**
   - Production: `https://your-app.vercel.app/api/up-webhook`
   - Development: Use ngrok for local testing
   - Endpoint: `/api/up-webhook` (POST)

3. **Features implemented:**
   - ✅ Real-time payment processing
   - ✅ Automatic debt reconciliation
   - ✅ Duplicate transaction prevention
   - ✅ Comprehensive error handling and logging
   - ✅ 1¢ tolerance for rounding differences
   - ✅ Housemate identification from transaction descriptions
   - 🚧 Dashboard UI for unmatched transactions (planned for Milestone 5)

### Key Improvements Made:
- **Rounding tolerance**: ±1¢ tolerance handles rounded payments (e.g., $25.43 debt paid as $25.00)
- **Event deduplication**: Only processes `TRANSACTION_SETTLED` events to avoid duplicate processing
- **Function-based architecture**: Replaced static class with individual functions for better maintainability
- **Comprehensive error handling**: Detailed logging and error responses for debugging

## Milestone 5: Frontend Application
Goal: Build a protected application with bills and housemates management.

### ✅ Authentication Protection

- All routes protected with Better Auth
- Automatic redirect to `/login` for unauthenticated users
- Session management with server-side validation

### ✅ Application Pages

1. **Bills Management** (`/bills`):
   - Bills overview with summary cards
   - Bills table with payment tracking
   - Manual bill upload functionality
   - Mark debts as paid interface

2. **Housemates Management** (`/housemates`):
   - Housemate list with statistics
   - Add/edit/deactivate housemates
   - View individual debt history

### ✅ UI Components

Built with shadcn/ui components:
- `Card` components for sections
- `Table` for data display
- `Button` for actions
- `Dialog` for modals
- `Input` and `Label` for forms

## Milestone 6: Deployment
Goal: Deploy the simplified single-package application.

### Build for Production

```bash
bun build
```

### Deploy to Vercel

Since everything is now in a single package:

1. **Deploy to Vercel**:
   - Push code to GitHub
   - Connect repository to Vercel
   - Configure environment variables
   - Automatic TanStack Start detection

### Configure Webhooks

Update webhook URLs:
- Email: `https://your-vercel-url.vercel.app/api/email-webhook`
- Cron: `https://your-vercel-url.vercel.app/api/cron/generate-bills`

### Vercel Cron Jobs

Add to `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/generate-bills",
      "schedule": "0 0 * * *"
    }
  ]
}
```

## Architecture Benefits

### ✅ Simplified Structure
- **Before**: Complex monorepo with oRPC and React Query
- **After**: Single package with direct server function calls

### ✅ Better Developer Experience
- **Before**: `orpcClient.bills.getAllBills.query()`
- **After**: `await getAllBills()` (direct calls)

### ✅ Reduced Complexity
- No more API package compilation
- No React Query cache management
- Direct server-side state management
- Co-located server functions with UI

### ✅ Maintainability
- Single package.json
- Simplified dependency management
- Direct import paths
- Better TypeScript integration

This refactored architecture provides the same functionality with significantly reduced complexity and better maintainability.