# TripLedger

**TripLedger** is a trustworthy, end-to-end shared expense and trip ledger designed for groups, couples, and families. It is built to provide complete financial clarity during and after group travel — far beyond what a basic expense-splitting calculator can offer.

With TripLedger, group members log expenses as they happen; expenses are verified according to configurable trip rules; families or couples can combine their financial shares into single **settlement units** without altering individual member roles; and at the end of a trip, TripLedger calculates an exact, mathematically conserved settlement showing precisely who owes whom, reduces the number of settlement transactions required using creditor/debtor matching, and permanently freezes the completed ledger.

---

## Overview

Managing shared expenses on group trips often fails due to spreadsheets, manual calculations, or naive splitting apps that cannot handle complex real-world travel dynamics. TripLedger addresses these core challenges with a structured, rule-based approach:

- **Shared Settlement Units**: Families or couples can share a single settlement unit (e.g., "The Johnsons") so that expenses are split per-unit rather than forcing each individual to settle separately.
- **Configurable Expense Verification**: Trips can run on `automatic` verification, `member_approval` (requiring non-payer member approval), or `tiered` approval (custom rules routing expenses to specific approval tiers based on amount thresholds).
- **Flexible Budget Tracking**: Supports `fixed_total`, `fixed_per_person`, and `unlimited` budget types with color-coded status thresholds (70% warning, 100% cap).
- **Fair-Share Settlement Engine**: Calculates net balances across settlement units with exact conservation of money ($\sum \text{netBalance} = 0$), guaranteeing zero precision loss by managing money strictly as integer minor units (e.g., paise / cents).
- **Finalized Settlement Snapshots**: Finalizing a settlement snapshots the exact balances and included expense IDs. Subsequent changes to live data cannot retroactively alter a historical settlement.
- **Immutable Trip Closure & Ledger Freeze**: A two-stage confirmation workflow (`expenses_complete` $\rightarrow$ `final_settlement`) requires active members to confirm completion, after which the trip transitions to `closed`. Closed trips become strictly read-only, guarded at the API level.

---

## Current Status

TripLedger has completed its entire application development cycle through the **Fixture Phase** and is now ready for **Phase 10 — Deployment**.

Current pre-deployment release candidate checkpoint: `55a89f2` (`TripLedger: integrate final landing page design`).

### Development Phase Matrix

| Phase | Scope / Description | Status |
|---|---|---|
| **Phase 1** | Backend + PostgreSQL + Database Foundation | **COMPLETE** |
| **Phase 2** | Authentication & User Accounts (JWT, bcrypt, Google OAuth foundation) | **COMPLETE** |
| **Phase 3** | Trip Management (Creation, 7-char join codes, membership, settlement units) | **COMPLETE** |
| **Phase 4** | Expense Management (Logging, editing, deleting, participants, budget validation) | **COMPLETE** |
| **Phase 4.1** | Unlimited Budget Support (Unlimited budget handling & UI representation) | **COMPLETE** |
| **Phase 5** | Approval & Verification Engine (Automatic, member, & tiered approval rules) | **COMPLETE** |
| **Phase 6** | Dashboard, Notifications & Activity History (Activity feeds, event logs) | **COMPLETE** |
| **Phase 7** | Fair-Share Settlement Engine (Balances, transaction reduction via creditor/debtor matching, live preview) | **COMPLETE** |
| **Phase 8** | Trip Closure & Final Settlement Snapshots (Persistence, confirmation stages) | **COMPLETE** |
| **Phase 9** | Product Polish & Production Readiness (UI/UX, responsive hardening, 9.1–9.9.9) | **COMPLETE** |
| **Phase 9.9.9** | Final QA & End-to-End System Validation | **COMPLETE** |
| **Fixture Phase** | Independent Environment Validation & Stability Hardening | **COMPLETE** |
| **Phase 10** | Production Deployment (`trip-ledger.in`) | **READY / NEXT** |

---

## Core Features

### 1. Authentication & Account Management
- **Email & Password Authentication**: Secure registration and login using bcrypt password hashing (cost factor 12) and JSON Web Tokens (JWT).
- **Optional Google Sign-In**: Integration with Google Identity Services featuring server-side ID-token verification (`google-auth-library`).
- **Profile Management**: Profile updates and user session retrieval via `/api/auth/me`.
- **Fast-Fail Startup**: The server validates environment secrets on boot, preventing broken authentication states.

### 2. Trip Management & Joining
- **Trip Creation**: Configure trip title, description, dates, budget type, and verification mode.
- **Canonical Join Codes**: 7-character alphanumeric join codes generated with unambiguous characters (excluding `0`, `O`, `1`, `I`, `L`), matched case-insensitively.
- **Role-Based Permissions**: Distinct permissions for Trip Owners, Admins, and Members.
- **Individual & Group Settlement Units**: Default individual units created upon joining, with support for custom group/family units. Moving members between units preserves historical expense attributions.

### 3. Expense Management & Budget Tracking
- **Integer Minor Unit Precision**: All currency amounts are stored and calculated as integer minor units (e.g., `100` = ₹1.00), preventing floating-point rounding errors.
- **Flexible Participant Allocation**: Select specific settlement units participating in each expense; excluded units incur zero liability.
- **Budget Types**:
  - `fixed_total`: Fixed lump-sum budget for the trip.
  - `fixed_per_person`: Budget limit scales dynamically with active member count.
  - `unlimited`: Running total tracked without cap warnings or limits.
- **Visual Budget Progress**: Color-coded progress indicators (Green < 70%, Yellow 70–99%, Red $\ge$ 100%).

### 4. Expense Verification & Tiered Approvals
- **Verification Modes**:
  - `automatic`: Expenses are verified immediately upon creation.
  - `member_approval`: Expenses created by non-owners start as `pending` and require approval from other trip members.
  - `tiered`: Custom rules route expenses to specific approval tiers based on amount thresholds (e.g., < ₹1,000 auto-verifies; ₹1,000–₹5,000 requires 1 approval; > ₹5,000 requires 2 approvals).
- **Approval Actions**: Payer self-approval is blocked; members can approve, reject, or withdraw approvals.
- **Approval Audit History**: Full event log tracking approval status and deciders.

### 5. Dashboard, Notifications & Activity Feed
- **Trip Dashboard**: Overview cards for total spending, budget status, recent expenses, pending approvals, and active members.
- **Notification System**: Notifications generated for expense creation, approval requests, verification results, member joins, and trip closure events. Supports read/unread filtering and batch mark-as-read.
- **Activity History**: Newest-first paginated event stream documenting all trip activities.

### 6. Fair-Share Settlement Engine
- **Conservation of Money**: Mathematically enforces $\sum \text{netBalance} = 0$.
- **Transaction Consolidation**: Greedy matching algorithm matches largest debtors to largest creditors, reducing the total number of transactions required to settle the trip.
- **Live Preview**: Real-time settlement calculation available at any point during the trip without modifying database state.

### 7. Immutable Trip Closure & Final Settlement Snapshots
- **Two-Stage Closure Confirmation**:
  1. `expenses_complete`: All active members confirm no further expenses will be added (transitions trip status from `active` to `closing`).
  2. `final_settlement`: All active members confirm and accept the finalized settlement (transitions trip status from `closing` to `closed`).
- **Snapshot Persistence**: Finalizing a settlement writes an immutable snapshot to `settlements` and `settlement_transactions`.
- **API-Level Ledger Freeze**: Once closed, backend guards reject all mutation endpoints (`createExpense`, `updateExpense`, `approveExpense`, `rejectExpense`, `createApprovalRule`, `settlement-unit` changes) with `409 TRIP_ALREADY_CLOSED`.

### 8. Production-Grade UI/UX & Standalone Landing Page
- **Custom Design System**: Rich dark theme built with plain Vanilla CSS (`LandingPage.css`, `tokens.css`), custom typography (`Fraunces` and `IBM Plex Mono`), glassmorphism, and smooth animations.
- **Responsive Layouts**: Tested and hardened across all breakpoints (320px, 375px, 480px, 768px, 1024px, 1280px, 1440px+).
- **Integrated Landing Page**: Includes a hero section, Old Way vs. TripLedger Way comparison, interactive product showcase (Activity, Balances, Settlements, Exports), How It Works 7-step timeline, FAQ accordion, sticky translucent navigation, and CTA routing. Contains zero fabricated statistics or fake social proof.

---

## Technology Stack

### Backend
- **Runtime**: Node.js (v18+ recommended for native `--watch` and `node --test` runner)
- **Framework**: Express.js
- **Database**: PostgreSQL (v14+) with native `pg` client
- **Database Migrations**: `node-pg-migrate`
- **Authentication**: `jsonwebtoken` (JWT), `bcrypt` (password hashing), `google-auth-library` (Google ID token verification)
- **Validation**: Zod schema validation
- **Security & Middleware**: Helmet (HTTP headers), CORS (origin restriction), `express-rate-limit` (auth rate limiting)

### Frontend
- **Framework**: React (v19.2.8)
- **Build Tool**: Vite (v8.2.0)
- **Routing**: React Router DOM (v7.18.2)
- **HTTP Client**: Axios (v1.19.0)
- **Animation & Graphics**: GSAP (v3.15.0), Three.js (v0.185.1)
- **Styling**: Vanilla CSS (CSS custom properties/design tokens, no external UI library overhead)
- **Icons & Assets**: Custom SVG & Base64 vector assets
- **Testing**: Vitest, React Testing Library
- **Linting**: Oxlint

---

## Project Architecture

```
TripLedger/
├── backend/
│   ├── src/
│   │   ├── config/             # DB connection pool, environment verification
│   │   ├── controllers/        # Express route handlers
│   │   ├── middleware/         # Auth, error handling, rate limiting, trip validation
│   │   ├── migrations/         # SQL migration scripts (node-pg-migrate)
│   │   ├── repositories/       # Data access layer (PostgreSQL queries & transactions)
│   │   ├── routes/             # API endpoint definitions
│   │   ├── services/           # Business logic, algorithms, closure state machine
│   │   ├── utils/              # JWT, password hashing, join code generator, AppError
│   │   └── validators/         # Zod input validation schemas
│   └── tests/                  # Unit and integration test suites
├── frontend/
│   ├── public/                 # Static assets & favicon
│   ├── src/
│   │   ├── api/                # HTTP API client modules
│   │   ├── app/                # App root, React Router configuration
│   │   ├── components/         # Modular UI components (auth, closure, dashboard, etc.)
│   │   ├── content/            # Static content data
│   │   ├── context/            # AuthContext & ToastContext
│   │   ├── hooks/              # Custom React hooks (useAuth, useToast, useDocumentTitle)
│   │   ├── pages/              # Application pages & LandingPage
│   │   ├── styles/             # Global CSS tokens, cards, badges, skeletons
│   │   └── test/               # Vitest setup
│   └── vite.config.js
└── README.md
```

### Data Flow Architecture

```
Client Request (React Frontend)
       │
       ▼
Express Route Handler (/api/...)
       │
       ▼
Zod Input Validation Middleware
       │
       ▼
Authentication & Trip Membership Middleware
       │
       ▼
Service Layer (Business Logic / State Machine)
       │
       ▼
Repository Layer (Parameterized SQL / PostgreSQL Transactions)
       │
       ▼
PostgreSQL Database
```

---

## Authentication Architecture

TripLedger implements a dual-mode authentication architecture:

```
                  ┌────────────────────────┐
                  │   User Registration    │
                  └───────────┬────────────┘
                              │
                              ▼
                  ┌────────────────────────┐
                  │ bcrypt Password Hash   │
                  └───────────┬────────────┘
                              │
                              ▼
┌──────────────────┐      ┌───┴────────────────┐
│   Standard Login ├─────►│ JWT Signed Token   │
└──────────────────┘      └───┬────────────────┘
                              │
┌──────────────────┐          │ (Bearer Token)
│  Google Sign-In  ├──────────┤
└────────┬─────────┘          │
         │                    ▼
         ▼        ┌────────────────────────┐
┌─────────────────┤ Protected API Routes   │
│ Google ID Token │ │ (/api/trips, etc.)    │
│ Verification    │ └────────────────────────┘
└─────────────────┘
```

1. **Email & Password**: Passwords are hashed with bcrypt before storage. Login returns a signed JWT containing user ID and email.
2. **Google OAuth 2.0**: The frontend uses Google Identity Services to obtain an ID token. The backend verifies the token directly against Google's public keys via `google-auth-library` before issuing a standard TripLedger JWT.
3. **Client ID Environment Separation**:
   - `GOOGLE_CLIENT_ID` (backend) is used for server-side ID token verification.
   - `VITE_GOOGLE_CLIENT_ID` (frontend) is bundled into the client build to initialize Google Sign-In.
   - *Note*: OAuth client IDs are public identifiers. No client secrets are embedded in the frontend.

---

## Complete Trip Lifecycle

```
┌─────────────────┐
│   Create Trip   │ ──► Generates 7-char Join Code & initial owner Settlement Unit
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Join Trip    │ ──► Members join via code & set individual or group/family units
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Log Expenses   │ ──► Integer minor unit amounts, participant selection, budget checks
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Verify Expenses │ ──► Automatic, Member Approval, or Tiered Rules
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Live Settlement │ ──► Real-time fair-share balance & transaction preview
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│Confirm Expenses │ ──► Stage 1: All active members confirm expenses_complete
└────────┬────────┘      (Trip status transitions: active ──► closing)
         │
         ▼
┌─────────────────┐
│Finalize Snapshot│ ──► Owner/Admin finalizes settlement snapshot to database
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Confirm Final   │ ──► Stage 2: All active members confirm final_settlement
└────────┬────────┘      (Trip status transitions: closing ──► closed)
         │
         ▼
┌─────────────────┐
│  Trip Closed    │ ──► Ledger frozen; API-level read-only protection active
└─────────────────┘
```

---

## Expense Verification & Approval System

TripLedger supports three distinct verification modes configured per trip:

1. **`automatic`**: Created expenses are verified immediately and included in live settlement calculations.
2. **`member_approval`**: Non-payer members must approve the expense. Once approved, status changes from `pending` to `verified`.
3. **`tiered`**: Amount-based approval rules configured by the trip owner/admin:
   - Rules specify `minAmountMinor`, `maxAmountMinor`, and `requiredApprovals`.
   - Overlapping rules are rejected during rule creation with `409 APPROVAL_RULE_OVERLAP`.
   - Expenses outside any rule threshold fail safely with `APPROVAL_RULE_NOT_FOUND`.

---

## Settlement & Snapshot Engine

The settlement engine converts verified expense records into a balanced transaction plan that reduces total transfers using creditor/debtor matching.

### Mathematical Guarantees
1. **Conservation of Money**: 
   $$\sum_{i=1}^{N} \text{netBalance}_i = 0$$
   The sum of all net balances across all settlement units equals zero.
2. **Exact Minor Unit Split**: When dividing expenses, remainder units are distributed deterministically, ensuring zero money is created or destroyed.
3. **Snapshot Immutability**:
   - **Live Preview** (`GET /api/trips/:tripId/settlement`): Dynamically computed from currently verified expenses.
   - **Finalized Snapshot** (`POST /api/trips/:tripId/settlement/finalize`): Writes rows to `settlements` and `settlement_transactions`. Once written, the snapshot is permanent and unaffected by subsequent data changes.

---

## Trip Closure & Ledger Freeze

Trip closure is a state-machine workflow protecting historical ledger integrity:

```
[active] ──(All members confirm expenses_complete)──► [closing] ──(Finalize Snapshot + All confirm final_settlement)──► [closed]
```

### Confirmation Workflow
1. **Stage 1 (`expenses_complete`)**: Members confirm they have finished adding expenses. The first confirmation transitions the trip status from `active` to `closing`.
2. **Finalization**: The trip owner/admin calls `/settlement/finalize`. Requires unanimous `expenses_complete` confirmations.
3. **Stage 2 (`final_settlement`)**: Members review and confirm the finalized settlement. When the last active member confirms, the trip automatically transitions to `closed`.

### Closed-Trip API Protections
Once status is `closed`, the following backend service calls are guarded and return `409 TRIP_ALREADY_CLOSED`:
- `ExpenseService.createExpense`
- `ExpenseService.updateExpense`
- `ExpenseApprovalService.approveExpense`
- `ExpenseApprovalService.rejectExpense`
- `ExpenseApprovalService.createApprovalRule`
- `TripService.updateMemberSettlementUnit`

---

## Database Schema & Migrations

Database schema management is handled by `node-pg-migrate`.

### Key Tables
- `users`: User credentials, hashed passwords, profile details.
- `trips`: Trip settings, join codes, status (`active`, `closing`, `closed`), budget configuration.
- `settlement_units`: Individual and group/family settlement units.
- `trip_members`: User membership in trips and assignment to settlement units.
- `expenses`: Expense records, minor-unit amounts, paid-by references, verification status.
- `expense_participants`: Mapping of expenses to participating settlement units.
- `approval_rules`: Tiered approval threshold rules.
- `expense_approvals`: Decision audit logs (approvals/rejections/withdrawals).
- `notifications`: User notification queue.
- `history_events`: Trip activity audit stream.
- `settlements`: Finalized settlement snapshots.
- `settlement_transactions`: Finalized creditor/debtor transaction records.
- `trip_closure_confirmations`: User stage confirmations (`expenses_complete`, `final_settlement`).

---

## Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string for development |
| `TEST_DATABASE_URL` | For Tests | — | **Dedicated test database** connection string. Server refuses to run `NODE_ENV=test` without this. |
| `JWT_SECRET` | Yes | — | Secret key for signing JWT tokens. Server fails fast if omitted. |
| `GOOGLE_CLIENT_ID` | Optional | — | Google Cloud OAuth Client ID for verifying Google Sign-In tokens. |
| `PORT` | No | `4000` | Port for the Express server. |
| `CORS_ORIGIN` | No | `http://localhost:5173` | Allowed CORS origins (comma-separated for multiple origins). |

### Frontend (`frontend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_API_BASE_URL` | No | `http://localhost:4000/api` | Base URL for backend API requests. |
| `VITE_GOOGLE_CLIENT_ID` | Optional | — | Client ID for Google Identity Services frontend button. |

> **Security Note**: Variables prefixed with `VITE_` are exposed to the browser build. Never place private secrets in `VITE_*` variables.

---

## Local Development Setup

### Prerequisites
- **Node.js**: v18+ (or higher) and `npm`
- **PostgreSQL**: v14+ running locally

### Step-by-Step Setup

1. **Navigate to the Repository Directory**:
   ```bash
   cd TripLedger
   ```

2. **Configure Environment Files**:
   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```
   *Edit `backend/.env` to supply your local PostgreSQL credentials and a JWT secret.*

3. **Initialize Development Database & Run Migrations**:
   ```bash
   createdb tripledger
   cd backend
   npm install
   npm run migrate:up
   ```

4. **Start the Backend Server**:
   ```bash
   cd backend
   npm run dev
   # Server runs at http://localhost:4000
   ```

5. **Start the Frontend Development Server**:
   ```bash
   cd frontend
   npm install
   npm run dev
   # Client runs at http://localhost:5173
   ```

6. **Verify System Health**:
   ```bash
   curl http://localhost:4000/api/health
   # Expected response: {"status":"ok","dbTime":"..."}
   ```

---

## Testing & Quality Assurance

TripLedger includes comprehensive, isolated test suites for both backend and frontend.

### Dedicated Test Database Isolation
Backend integration tests require a **dedicated test database** to prevent data contamination:

```bash
createdb tripledger_test
export TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tripledger_test
cd backend
npm run test:migrate   # Applies migrations to tripledger_test
npm test               # Executes full test suite under NODE_ENV=test
```

### Verified Test Results

- **Backend Test Suite**: **265 / 265 passed** (0 failures across unit, integration, settlement, closure, and snapshot regression suites).
- **Frontend Test Suite**: **43 / 43 passed** (0 failures across 7 test files in Vitest).
- **Linter (`oxlint`)**: **0 errors** across 82 frontend files.

---

## Security Architecture

1. **Password Security**: Passwords hashed with bcrypt (salt rounds = 12). Passwords are never returned in API responses or written to log outputs.
2. **JWT Fast-Fail Guard**: Server startup validates `JWT_SECRET` presence immediately.
3. **CORS Restrictions**: Origin locking via `CORS_ORIGIN` middleware.
4. **Auth Rate Limiting**: `/api/auth/register`, `/api/auth/login`, and `/api/auth/google` are rate-limited to 20 requests per 15 minutes per IP.
5. **Security Headers**: Helmet middleware applied across all routes.
6. **Information-Leakage Prevention**: Server errors log full tracebacks internally but return generic `{ "error": { "code": "INTERNAL_ERROR", "message": "Something went wrong" } }` responses to clients.
7. **Database Isolation**: Application code refuses to run tests against `DATABASE_URL`.
8. **Server-Side Authorization**: Closed-trip freezes and ownership permissions are enforced by backend service guards, independent of frontend state.

---

## Google OAuth Setup (Optional)

Google Sign-In is completely optional; email/password authentication functions without it. To enable Google Sign-In:

1. Create an OAuth 2.0 Client ID (Web Application) in the [Google Cloud Console](https://console.cloud.google.com/).
2. Add `http://localhost:5173` to **Authorized JavaScript origins**.
3. Set the Client ID in `backend/.env` (`GOOGLE_CLIENT_ID`) and `frontend/.env` (`VITE_GOOGLE_CLIENT_ID`).
4. Restart both servers.

---

## API Overview

| Route Group | Base Path | Key Capabilities |
|---|---|---|
| **Authentication** | `/api/auth` | Register, Login, Google Sign-In, Get Session User (`/me`), Update Profile |
| **Trips** | `/api/trips` | Create Trip, Join Trip, List My Trips, Get Trip Detail, Get Members |
| **Settlement Units** | `/api/trips/:id/settlement-units` | Create Group Unit, Request/Approve Member Unit Transfer |
| **Expenses** | `/api/trips/:id/expenses` | Create Expense, List Expenses, Get Detail, Edit Expense, Delete Expense |
| **Approval Rules** | `/api/trips/:id/approval-rules` | Create Tiered Rule, List Approval Rules |
| **Verification** | `/api/trips/:id/expenses/:expId/approvals` | Approve, Reject, Withdraw Approval, Get Approval History |
| **Dashboard** | `/api/trips/:id/dashboard` | Get Summary Cards, Spending Totals, Pending Approvals |
| **Notifications** | `/api/notifications` | List Notifications, Mark Single Read, Mark All Read |
| **Activity History** | `/api/trips/:id/history` | Paginated Trip Event Log |
| **Settlement** | `/api/trips/:id/settlement` | Live Settlement Preview, Finalize Settlement (`/finalize`), Get Final Snapshot (`/final`) |
| **Trip Closure** | `/api/trips/:id/closure` | Get Closure Status, Confirm Stage (`/confirmations`) |

---

## Phase 10 — Deployment Plan

Phase 10 is the next stage in the TripLedger development roadmap.

**Production Domain Context**: `trip-ledger.in`

### Deployment Roadmap Sequence

```
10.1 Production Preparation (Configuration review, environment setup)
   │
   ▼
10.2 Production PostgreSQL (Provision managed database instance)
   │
   ▼
10.3 Backend Deployment (Deploy Node/Express service)
   │
   ▼
10.4 Frontend Deployment (Build & host static Vite assets)
   │
   ▼
10.5 Domain Setup (Connect trip-ledger.in DNS records)
   │
   ▼
10.6 HTTPS / SSL (Configure TLS certificates)
   │
   ▼
10.7 CORS Policy (Lock production origins)
   │
   ▼
10.8 Production Database Migration (Run migrate:up against production DB)
   │
   ▼
10.9 Production Smoke Test (Execute end-to-end user workflow)
   │
   ▼
10.10 Security Sanity Verification (Audit environment secrets & headers)
   │
   ▼
10.11 Deployment Documentation Finalization
```

### Phase 10 Deployment Checklist

- [ ] Provision production PostgreSQL instance
- [ ] Configure production `DATABASE_URL`
- [ ] Generate secure production `JWT_SECRET`
- [ ] Execute `npm run migrate:up` on production database
- [ ] Deploy backend API service
- [ ] Configure `CORS_ORIGIN` to `https://trip-ledger.in`
- [ ] Set `VITE_API_BASE_URL` to production backend API URL
- [ ] Build frontend production bundle (`npm run build`)
- [ ] Deploy frontend static assets to hosting provider
- [ ] Configure `trip-ledger.in` DNS A/AAAA/CNAME records
- [ ] Provision SSL/TLS certificates for HTTPS
- [ ] Configure Google OAuth Production Authorized Origins & Client ID
- [ ] Perform End-to-End Production Smoke Test
- [ ] Finalize production operational documentation

### Production Smoke Test Workflow

1. Register new user account on `trip-ledger.in`
2. Log in and verify JWT session
3. Test Google Sign-In authentication
4. Create a new trip
5. Join trip from a second user account using 7-character join code
6. Log an expense with participant allocation
7. Process expense verification / approval
8. Verify Dashboard card updates and notification delivery
9. Inspect Live Settlement preview
10. Finalize settlement snapshot
11. Confirm closure stages (`expenses_complete` $\rightarrow$ `final_settlement`)
12. Verify trip transitions to `closed` and API enforces read-only freeze

---

## Troubleshooting

- **`npm test` fails with "TEST_DATABASE_URL is not set"**:
  Expected protection behavior. Create `tripledger_test` and export `TEST_DATABASE_URL` before running tests.
- **Backend exits with "Missing required environment variable(s)"**:
  `backend/.env` is missing `JWT_SECRET` or `DATABASE_URL`. Copy `backend/.env.example` and supply valid values.
- **CORS error in browser console**:
  Ensure `CORS_ORIGIN` in `backend/.env` includes the exact scheme, domain, and port of the frontend client.
- **Google Sign-In button missing**:
  `VITE_GOOGLE_CLIENT_ID` is omitted in `frontend/.env`. Email/password authentication remains fully functional.
- **`404` joining a trip via join code**:
  Join codes are case-insensitive. Verify the code exists and that the user is not already a member of the trip.

---

## Technical Design Notes

### Finalized Settlement Snapshots (Phase 8 & 9.7 Architecture)

To ensure historical integrity, TripLedger separates live previews from finalized settlements:

- **Live Preview** (`GET /api/trips/:tripId/settlement`): Computes balances dynamically from currently verified expenses.
- **Finalized Snapshot** (`POST /api/trips/:tripId/settlement/finalize`): Evaluates current fair shares and writes rows to `settlements` and `settlement_transactions`.
- **Idempotency**: Calling `/finalize` repeatedly returns the existing snapshot (`alreadyFinalized: true`) rather than recomputing or creating duplicate database rows.
- **Snapshot Integrity**: Once finalized, changes to live trip data do not alter the snapshot.

### Two-Stage Closure State Machine

The trip closure workflow guarantees all members agree before a trip is locked:

```
State: active
  │
  ├─► Member confirms expenses_complete
  │     └─► Status transitions to "closing"
  │
State: closing
  │
  ├─► Owner/Admin finalizes settlement snapshot
  │     └─► Settlement snapshot persisted to DB
  │
  ├─► All active members confirm final_settlement
  │     └─► Status automatically transitions to "closed"
  │
State: closed
  │
  └─► Ledger frozen; API mutation guards active (409 TRIP_ALREADY_CLOSED)
```

### Closed-Trip Mutation Guards

Backend services explicitly check `trip.status` before executing data mutations:
- `ExpenseService.createExpense` $\rightarrow$ `409 TRIP_ALREADY_CLOSED`
- `ExpenseService.updateExpense` $\rightarrow$ `409 TRIP_ALREADY_CLOSED`
- `ExpenseApprovalService.approveExpense` $\rightarrow$ `409 TRIP_ALREADY_CLOSED`
- `ExpenseApprovalService.rejectExpense` $\rightarrow$ `409 TRIP_ALREADY_CLOSED`
- `ExpenseApprovalService.createApprovalRule` $\rightarrow$ `409 TRIP_ALREADY_CLOSED`
- `TripService.updateMemberSettlementUnit` $\rightarrow$ `409 TRIP_ALREADY_CLOSED`

Reading endpoints (`GET` dashboard, history, notifications, expenses, settlement preview, final settlement) remain available for closed trips.
