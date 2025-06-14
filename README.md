# Sharehouse Bills

A modern bill management system for shared housing, built with a simplified TanStack Start architecture. Automatically processes bill PDFs via email, splits costs among housemates, and tracks payments.

## 🏗️ Architecture

This project uses a **simplified single-package architecture** with TanStack Start server functions:

- **Frontend & Backend**: TanStack Start with React 19
- **Database**: Drizzle ORM with SQLite/Turso
- **Authentication**: Better Auth with session management
- **AI Processing**: Google Gemini 1.5 Flash for PDF parsing
- **UI Components**: shadcn/ui with Tailwind CSS
- **Type Safety**: End-to-end TypeScript

## ✨ Features

### 📧 Email Bill Processing

- Forward bill PDFs to a webhook email
- AI automatically extracts bill details (amount, due date, biller)
- Creates bills and splits costs among active housemates
- Sends email notifications with processing results

### 🔄 Recurring Bills

- Automated weekly rent generation ($1890 every Thursday)
- Customizable recurring bill templates
- Automatic splitting among active housemates
- Cron job integration for automation

### 👥 Housemate Management

- Add/edit/deactivate housemates
- Track individual debt history and payment statistics
- Assign custom amounts for specific bills
- View payment rates and outstanding balances

### 💰 Payment Tracking

- Mark individual debts as paid
- Bill status tracking (pending, partially paid, paid)
- Summary dashboard with payment statistics
- Individual housemate debt views

### 🛠️ Developer Tools

- Manual bill upload interface
- Webhook statistics and monitoring
- Test bill processing functionality
- Cron job manual triggers

### 🚧 Planned Features

- **Up Bank Integration**: Automatic payment reconciliation via bank webhooks
- **Smart Payment Matching**: AI-powered transaction-to-debt matching

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh) runtime
- [Turso](https://turso.tech) database (or local SQLite)
- [Google AI Studio](https://makersuite.google.com/app/apikey) API key

### Installation

1. **Clone and install dependencies:**

```bash
git clone <repository>
cd sharehouse-bills
bun install
```

2. **Set up environment variables:**
   Create a `.env` file in the root:

```env
# Database
DATABASE_URL="your-turso-database-url"
DATABASE_AUTH_TOKEN="your-turso-auth-token"

# Authentication
BETTER_AUTH_SECRET="your-auth-secret"
BETTER_AUTH_URL="http://localhost:3001"

# AI Processing
GOOGLE_GENERATIVE_AI_API_KEY="your-gemini-api-key"

# Optional: Email notifications
TWILIO_ACCOUNT_SID="your-twilio-account-sid"
TWILIO_AUTH_TOKEN="your-twilio-auth-token"
```

3. **Set up the database:**

```bash
bun db:push
```

4. **Start the development server:**

```bash
bun dev
```

Open [http://localhost:3001](http://localhost:3001) to view the application.

## 📁 Project Structure

```
sharehouse-bills/
├── src/
│   ├── api/                    # Database & server-side logic
│   │   ├── db/                 # Database schema & connection
│   │   │   └── schema/         # Drizzle schema files
│   │   ├── services/           # Business logic services
│   │   └── lib/                # Auth & utilities
│   ├── functions/              # TanStack Start server functions
│   │   ├── bills.ts            # Bill management functions
│   │   ├── housemates.ts       # Housemate management functions
│   │   └── todo.ts             # Test functionality
│   ├── routes/                 # File-based routing
│   │   ├── api.*.ts            # API route handlers
│   │   ├── bills.tsx           # Bills dashboard
│   │   ├── housemates.tsx      # Housemates management
│   │   └── login.tsx           # Authentication
│   ├── components/             # Reusable UI components
│   └── lib/                    # Client utilities
├── package.json                # Single package configuration
├── drizzle.config.ts          # Database configuration
└── vite.config.ts             # Build configuration
```

## 🛠️ Available Scripts

### Development

```bash
bun dev                    # Start development server (port 3001)
bun build                  # Build for production
bun typecheck             # Check TypeScript types
bun check                 # Run Biome formatting and linting
```

### Database

```bash
bun db:push               # Push schema changes to database
bun db:studio             # Open Drizzle Studio for database management
bun db:generate           # Generate database migrations
bun db:migrate            # Run database migrations
```

## 🔧 Usage

### 1. Set Up Housemates

- Navigate to `/housemates`
- Add all housemates with their names and optional bank aliases
- Ensure at least one housemate is marked as "owner" (non-debt-paying)

### 2. Process Bills

**Via Email (Recommended):**

- Set up email forwarding to your webhook endpoint
- Forward bill PDFs to the email address
- Bills are automatically processed and split

**Manual Upload:**

- Navigate to `/bills`
- Click "Add Bill"
- Upload a PDF file
- AI extracts details and creates the bill

### 3. Track Payments

- View all bills on the `/bills` dashboard
- Click "Mark as Paid" for any bill
- Enter payment amounts for each housemate
- Track payment status and statistics

### 4. Manage Recurring Bills

- Weekly rent is automatically generated every Thursday
- Manual generation available via cron endpoint
- Customize amounts and schedules via database

## 📊 API Endpoints

### Server Functions

- `getAllBills()` - Fetch all bills with debt information
- `createBill(data)` - Create a new bill
- `markDebtPaid(debtId, isPaid)` - Update payment status
- `getAllHousemates()` - Fetch all housemates
- `createHousemate(data)` - Add new housemate

### HTTP Routes

- `POST /api/email-webhook` - Process email attachments
- `POST /api/cron/generate-bills` - Generate recurring bills
- `GET/POST /api/auth/*` - Authentication endpoints

## 🚀 Deployment

### Vercel (Recommended)

1. Connect your repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically with git push

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

## 🔒 Authentication

The application uses Better Auth with email/password authentication:

- All routes are protected except `/login`
- Session-based authentication
- Automatic redirect to login for unauthenticated users

## 🤖 AI Processing

Bills are processed using Google Gemini 1.5 Flash:

- Extracts biller name, total amount, and due date from PDFs
- Handles various bill formats automatically
- Structured JSON output for database insertion

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Run `bun check` for linting
4. Run `bun typecheck` for type checking
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.
