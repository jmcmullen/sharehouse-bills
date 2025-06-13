# PLAN.md

## Milestone 0: Project Setup & Configuration
Goal: Prepare the development environment, install all dependencies, and connect to external services.

### ✅ Project Already Initialized
The project is already set up with the Better-T-Stack:
- Frontend & API: TanStack Start with React 19 (serves both UI and API routes)
- API Package: ORPC server in packages/api
- Database: Drizzle ORM with SQLite/Turso
- Authentication: Better Auth

### Install Additional Dependencies

Navigate to the API package directory and install necessary packages:
```bash
cd packages/api
# Twilio for WhatsApp
bun add twilio

# OpenAI SDK for PDF parsing
bun add openai
```

### Set Up Environment Variables

Update the existing `.env` file in `apps/web/.env` with these additional keys:
```env
# Existing keys...

# Twilio / SendGrid
TWILIO_ACCOUNT_SID="your-twilio-account-sid"
TWILIO_AUTH_TOKEN="your-twilio-auth-token"
TWILIO_PHONE_NUMBER="your-twilio-whatsapp-number"
WHATSAPP_GROUP_ID="your-whatsapp-group-id"

# Up Bank API
UP_BANK_API_TOKEN="your-up-bank-personal-access-token"

# Webhook Security
WEBHOOK_SECRET="generate-a-strong-random-string-here"

# OpenAI API
OPENAI_API_KEY="your-openai-api-key"
```

### Update Database Schema

1. Modify the schema file at `packages/api/src/db/schema.ts` to add the required tables for bills management
2. Push schema changes to database:
```bash
bun db:push
```

## Milestone 1: Core Ledger & Admin Panel
Goal: Build the admin dashboard to view bills and manually mark debts as paid.

### Create Admin Routes

1. Create admin page at `apps/web/src/routes/admin/index.tsx`
2. Use TanStack Query with ORPC to fetch bills data
3. Implement server-side data fetching using ORPC protected procedures

### Create ORPC Routers

1. Create `packages/api/src/routers/bills.ts`:
   - `getAllBills` - Protected procedure to fetch all bills with related debts
   - `markDebtAsPaid` - Protected procedure to mark a debt as paid

2. Update `packages/api/src/routers/index.ts` to include the bills router

### Display Data in Admin Panel

1. Use shadcn/ui components for the table display
2. Create a `BillsTable` component with:
   - Bill information display
   - Nested debt information for each bill
   - "Mark as Paid" buttons for unpaid debts

### Implement Mark as Paid Functionality

1. Use ORPC client mutation in the frontend:
```typescript
const markPaidMutation = client.bills.markDebtAsPaid.useMutation({
  onSuccess: () => {
    // Invalidate and refetch bills
    queryClient.invalidateQueries({ queryKey: ['bills'] })
  }
})
```

## Milestone 2: Email Ingestion & AI Parsing
Goal: Create webhook endpoint for SendGrid emails, parse PDFs with AI, and create bill records.

### Create Webhook Endpoint

1. Create webhook API route at `apps/web/src/routes/api/webhook/email.ts`
2. Add email webhook endpoint using TanStack Start API route:
```typescript
import { createAPIFileRoute } from "@tanstack/start/api"

export const Route = createAPIFileRoute("/api/webhook/email")({ 
  POST: async ({ request }) => {
    // Handle SendGrid webhook
  }
})
```

### Implement PDF Processing with OpenAI

1. Extract PDF from multipart form data
2. Send PDF directly to OpenAI for parsing:
```typescript
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// Convert PDF buffer to base64
const pdfBase64 = pdfBuffer.toString('base64')

const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{
    role: "user",
    content: [
      { type: "text", text: "Extract bill details from this PDF. Return JSON with billerName, totalAmount, and dueDate." },
      { 
        type: "image_url",
        image_url: {
          url: `data:application/pdf;base64,${pdfBase64}`
        }
      }
    ]
  }],
  response_format: { type: "json_object" }
})

const billDetails = JSON.parse(response.choices[0].message.content)
```

### Create Database Records

1. Add ORPC procedure `createBillFromParsedData` in bills router
2. Create bill record and associated debt records for all housemates
3. Trigger WhatsApp notification after successful creation

## Milestone 3: WhatsApp Notifications
Goal: Send bill notifications to WhatsApp group with PDF attachment.

### Create Notifier Module

1. Create `packages/api/src/lib/notifier.ts`
2. Implement `sendWhatsAppNotification` function using Twilio

### Implement Notification Logic

```typescript
export async function sendWhatsAppNotification(
  bill: Bill,
  debts: Debt[],
  invoicePdfBuffer: Buffer
) {
  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  )
  
  // Upload PDF and send message
}
```

### Integrate with Email Webhook

Update the email webhook to call `sendWhatsAppNotification` after bill creation.

## Milestone 4: Up Bank Reconciliation Engine
Goal: Create webhook for Up Bank transactions and implement smart payment reconciliation.

### Create Transaction Webhook

1. Add Up Bank webhook endpoint at `apps/web/src/routes/api/webhook/up-transaction.ts`:
```typescript
import { createAPIFileRoute } from "@tanstack/start/api"

export const Route = createAPIFileRoute("/api/webhook/up-transaction")({ 
  POST: async ({ request }) => {
    // Handle Up Bank webhook
  }
})
```

### Implement Reconciliation Engine

1. Verify webhook signature for security
2. Parse transaction details
3. Identify payer by matching bank alias
4. Implement matching algorithms:
   - Simple match: exact amount match
   - Combination match: subset sum algorithm
5. Update database records accordingly

### Handle Unmatched Transactions

Create `unreconciledTransactions` table and log failed matches with reasons.

## Milestone 5: Deployment
Goal: Deploy the application to production.

### Build for Production

```bash
bun build
```

### Deploy to Vercel

Since TanStack Start serves both frontend and API:

1. **Deploy to Vercel**:
   - Push code to GitHub
   - Connect repository to Vercel
   - Configure all environment variables in Vercel dashboard
   - Vercel will automatically detect TanStack Start and configure build settings

### Configure Webhooks

Update SendGrid and Up Bank webhook URLs to point to production endpoints:
- SendGrid: `https://your-vercel-url.vercel.app/api/webhook/email`
- Up Bank: `https://your-vercel-url.vercel.app/api/webhook/up-transaction`

### Environment Variables

Ensure all environment variables are set in production:
- Database credentials (Turso)
- API keys (Twilio, Up Bank, OpenAI)
- Authentication secrets
- CORS origins