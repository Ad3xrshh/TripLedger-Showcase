# TripLedger

**TripLedger** is a trustworthy, end-to-end shared expense and trip ledger designed for groups, couples, and families. It is built to provide complete financial clarity during and after group travel — far beyond what a basic expense-splitting calculator can offer.

With TripLedger, group members log expenses as they happen; expenses are verified according to configurable trip rules; families or couples can combine their financial shares into single **settlement units** without altering individual member roles; and at the end of a trip, TripLedger calculates an exact, mathematically conserved settlement showing precisely who owes whom, reduces the number of settlement transactions required using creditor/debtor matching, and permanently freezes the completed ledger.

TripLedger is fully developed, tested, security-audited, and deployed to production at **[https://trip-ledger.in](https://trip-ledger.in)**.

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

## Current Status & Deployment Matrix

TripLedger has completed all development, verification, security auditing, and production deployment phases. The system is fully operational in production.

### Deployed Production Endpoints

| Resource | URL |
|---|---|
| **Production Application** | [https://trip-ledger.in](https://trip-ledger.in) |
| **Vercel Frontend Host** | [https://tripledger-ten.vercel.app](https://tripledger-ten.vercel.app) |
| **Render Backend API** | [https://tripledger-backend-svx0.onrender.com](https://tripledger-backend-svx0.onrender.com) |
| **Backend Health Endpoint** | `https://tripledger-backend-svx0.onrender.com/api/health` |

### Development & Deployment Roadmap

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
| **Phase 10.1–10.7** | Production Preparation, Infrastructure, Hosting, SSL, CORS Setup | **COMPLETE** |
| **Phase 10.8** | Production Database Verification (Schema, 8/8 migrations applied, index integrity) | **COMPLETE** |
| **Phase 10.9** | Final Production Smoke Test | **COMPLETE** |
| **Phase 10.10** | Security Review (IDOR, secret isolation, CORS, rate limiting, error responses) | **COMPLETE** |
| **Phase 10.11** | Documentation Finalization | **COMPLETE** |

---

## Core Features

### 1. Authentication & Account Management
- **Email & Password Authentication**: Secure registration and login using bcrypt password hashing (cost factor 12) and JSON Web Tokens (JWT).
- **Google Sign-In**: Integration with Google Identity Services featuring server-side ID-token verification (`google-auth-library`). Authorized for the production domain `https://trip-ledger.in`.
- **Profile Management**: Profile updates and user session retrieval via `/api/auth/me`.
- **Fast-Fail Startup**: Server startup validates required environment variables (`JWT_SECRET`, `DATABASE_URL`) before listening.

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

### 8. Production UI/UX & Integrated Landing Page
- **Custom Design System**: Rich dark theme built with Vanilla CSS (`tokens.css`), typography (`Fraunces` and `IBM Plex Mono`), glassmorphism, and subtle micro-animations.
- **Responsive Layouts**: Hardened across mobile, tablet, and desktop breakpoints (320px to 1440px+).
- **Integrated Landing Page**: Includes hero section, Old Way vs. TripLedger Way comparison, interactive product showcase, 7-step timeline, FAQ accordion, translucent navigation, and authentication routing.

---

## Technology Stack

### Backend
- **Runtime**: Node.js (v18.11+ for native `--watch` and `node --test` runner support)
- **Framework**: Express.js
- **Database**: PostgreSQL (hosted on Supabase) via native `pg` pool client
- **Database Migrations**: `node-pg-migrate` (8 applied migrations)
- **Authentication**: `jsonwebtoken` (JWT), `bcrypt` (password hashing), `google-auth-library` (Google ID token verification)
- **Validation**: Zod schema validation
- **Security & Middleware**: Helmet (HTTP headers), CORS (restricted origin), `express-rate-limit` (auth endpoint rate limiting)
- **Hosting**: Render

### Frontend
- **Framework**: React (v19.2.8)
- **Build Tool**: Vite (v8.2.0)
- **Routing**: React Router DOM (v7.18.2)
- **HTTP Client**: Axios (v1.19.0) with central response interceptors
- **Animation & Graphics**: GSAP (v3.15.0), Three.js (v0.185.1)
- **Styling**: Vanilla CSS (CSS custom properties, design tokens)
- **Testing**: Vitest, React Testing Library
- **Linting**: Oxlint
- **Hosting**: Vercel
- **Custom Domain**: `https://trip-ledger.in`

---

## Architecture & Data Flow

```
Browser (https://trip-ledger.in)
       │
       ▼
Vercel / React Frontend
       │
       ▼  (HTTPS REST API / JSON + JWT Authorization Header)
Render / Express API Backend
       │
       ▼  (PostgreSQL Client Pool / Parameterized SQL Queries)
Supabase PostgreSQL Database
```

> **Database Isolation Notice**: The Express backend is the sole application tier connecting to PostgreSQL. The React frontend contains zero database drivers, credentials, or direct DB connection strings.

### Internal Application Architecture

```
Express Route Handler (/api/...)
       │
       ▼
Zod Input Validation Middleware (validate.js)
       │
       ▼
Authentication & Trip Membership Middleware (requireAuth.js, requireTripMembership.js)
       │
       ▼
Service Layer (ExpenseService, SettlementService, ClosureService)
       │
       ▼
Repository Layer (expenseRepository, tripRepository, PostgreSQL Transactions)
       │
       ▼
PostgreSQL Database (Supabase)
```

---

## Authentication Architecture

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

1. **Email & Password**: Passwords are hashed with bcrypt (`SALT_ROUNDS = 12`) before storage. Login returns a signed JWT containing minimal, non-sensitive payload (`sub: user.id`, `email`).
2. **Google OAuth 2.0**: The frontend uses Google Identity Services to obtain an ID token. The backend verifies the token directly against Google public certificates using `google-auth-library` before issuing a standard TripLedger JWT.
3. **Environment Isolation**:
   - `GOOGLE_CLIENT_ID` (backend) is used for server-side ID token verification.
   - `VITE_GOOGLE_CLIENT_ID` (frontend) is bundled into the client build for Google Identity Services initialization.

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
3. **Transaction Reduction**: A greedy matching algorithm matches largest debtors to largest creditors, consolidating settlement transfers.
4. **Snapshot Immutability**:
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
Once status is `closed`, backend guards reject mutation calls with `409 TRIP_ALREADY_CLOSED`:
- `ExpenseService.createExpense`
- `ExpenseService.updateExpense`
- `ExpenseApprovalService.approveExpense`
- `ExpenseApprovalService.rejectExpense`
- `ExpenseApprovalService.createApprovalRule`
- `TripService.updateMemberSettlementUnit`

Reading endpoints (`GET` dashboard, history, notifications, expenses, settlement preview, final settlement) remain fully readable.

---

## Database Schema & Migrations

Database schema management is handled by `node-pg-migrate`. All 8 project migrations are applied in production:

1. `1700000000000_init-schema.sql` (Core tables: users, trips, trip_members, settlement_units, expenses, expense_participants)
2. `1700000000100_add-notification-expense-link.sql` (Notification links)
3. `1700000000200_add-phase8-settlement-closure-indexes.sql` (Settlement closure indexes)
4. `1700000000300_rename-none-budget-type-to-unlimited.sql` (Budget type standardization)
5. `1700000000400_ledger-freeze-and-settlement-audit.sql` (Closure audit tables & snapshot schema)
6. `1700000000500_normalize-email-case.sql` (Case-insensitive email lookup index)
7. `1700000000600_add-settlement-unit-archived-at.sql` (Settlement unit archiving)
8. `1700000000700_add-settlement-transfer-requests.sql` (Group transfer requests)

---

## Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Scope | Description |
|---|---|---|
| `DATABASE_URL` | Server Secret | PostgreSQL connection string for production/development |
| `TEST_DATABASE_URL` | Server Secret | Dedicated test database connection string used strictly during `npm test` |
| `JWT_SECRET` | Server Secret | Secret key used to sign and verify JWT authentication tokens |
| `GOOGLE_CLIENT_ID` | Server Config | Google OAuth Client ID for server-side ID token verification |
| `PORT` | Server Config | Express server listening port (defaults to 4000) |
| `CORS_ORIGIN` | Server Config | Allowed CORS origins (e.g. `https://trip-ledger.in`) |
| `NODE_ENV` | Server Config | Environment flag (`production`, `development`, `test`) |

### Frontend (`frontend/.env`)

| Variable | Scope | Description |
|---|---|---|
| `VITE_API_BASE_URL` | Browser Public | Base API URL (e.g. `https://tripledger-backend-svx0.onrender.com/api`) |
| `VITE_GOOGLE_CLIENT_ID` | Browser Public | Google OAuth Client ID for Google Identity Services button |

> **Security Guard**: Only environment variables prefixed with `VITE_` are bundled into frontend client code. Server secrets (`DATABASE_URL`, `JWT_SECRET`) remain strictly server-side.

---

## Local Development Setup

### Prerequisites
- **Node.js**: v18.11+ (or v20+) and `npm`
- **PostgreSQL**: v14+ running locally

### Step-by-Step Setup

1. **Clone & Navigate**:
   ```bash
   cd TripLedger
   ```

2. **Configure Local Environment Files**:
   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```
   *Supply local PostgreSQL credentials and a local JWT_SECRET in `backend/.env`.*

3. **Initialize Database & Run Migrations**:
   ```bash
   createdb tripledger
   cd backend
   npm install
   npm run migrate:up
   ```

4. **Start Backend Server**:
   ```bash
   cd backend
   npm run dev
   # Server listens at http://localhost:4000
   ```

5. **Start Frontend Client**:
   ```bash
   cd frontend
   npm install
   npm run dev
   # Client runs at http://localhost:5173
   ```

6. **Check Health Endpoint**:
   ```bash
   curl http://localhost:4000/api/health
   # Expected response: {"status":"ok","dbTime":"..."}
   ```

---

## Testing & Quality Assurance

TripLedger includes comprehensive test suites covering unit, integration, settlement, closure, and frontend component behaviors.

### Verified Test Baseline

- **Backend Test Suite**: **265 / 265 passing** (0 failures across node test runner suites)
- **Frontend Test Suite**: **43 / 43 passing** (0 failures across Vitest files)
- **Oxlint**: **0 errors** (3 informational warnings, 0 errors across 82 files)
- **Production Build**: Vite client build succeeds cleanly

### Dedicated Test Database Isolation

Backend tests run against a isolated test database:

```bash
createdb tripledger_test
export TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tripledger_test
cd backend
npm run test:migrate
npm test
```

---

## Security Architecture & Audit Status

Phase 10.10 Security Review: **PASS**.

Key security protections implemented in TripLedger:

1. **Password Security**: Passwords hashed using `bcrypt` (salt rounds = 12).
2. **Secret Isolation**: Zero secrets or credentials committed to source control; `.env` files explicitly ignored in `.gitignore`.
3. **CORS Restrictions**: Production API restricts requests to allowed frontend origin (`https://trip-ledger.in`).
4. **Auth Rate Limiting**: Authentication routes (`/register`, `/login`, `/google`) rate-limited to 20 requests per 15 minutes per IP.
5. **Authorization & IDOR Protection**: All trip-scoped routes require active membership (`requireTripMembership`). Entity lookups check trip ownership and return non-leaking 404 responses for unauthorized requests.
6. **Input Validation**: All incoming requests validated via Zod schemas; URL parameters format-checked.
7. **SQL Injection Prevention**: All database access uses parameterized SQL queries via native `pg` pool.
8. **Error Masking**: Production errors mask internal stack traces and database details behind generic `500 INTERNAL_ERROR` responses.
9. **Security Headers**: Helmet middleware enabled for all HTTP responses.

---

## Production Infrastructure & URLs

TripLedger is deployed across the following production infrastructure:

- **Primary Application Domain**: [https://trip-ledger.in](https://trip-ledger.in)
- **Frontend Hosting**: Vercel ([https://tripledger-ten.vercel.app](https://tripledger-ten.vercel.app))
- **Backend API Hosting**: Render ([https://tripledger-backend-svx0.onrender.com](https://tripledger-backend-svx0.onrender.com))
- **Database Hosting**: Supabase PostgreSQL
- **Backend Health Check**: [https://tripledger-backend-svx0.onrender.com/api/health](https://tripledger-backend-svx0.onrender.com/api/health)
- **Database Status**: 8/8 migrations applied, schema verified, live DB connectivity verified.

---

## API Overview

| Route Group | Base Path | Key Capabilities |
|---|---|---|
| **Authentication** | `/api/auth` | Register, Login, Google Sign-In, Session User (`/me`), Update Profile |
| **Trips** | `/api/trips` | Create Trip, Join Trip, List Trips, Get Detail, List Members |
| **Settlement Units** | `/api/trips/:id/settlement-units` | Create Group Unit, Request/Approve Transfer |
| **Expenses** | `/api/trips/:id/expenses` | Create Expense, List Expenses, Get Detail, Update Expense |
| **Approval Rules** | `/api/trips/:id/approval-rules` | Create Tiered Rule, List Rules |
| **Verification** | `/api/trips/:id/expenses/:expId` | Approve (`/approve`), Reject (`/reject`), Verification History |
| **Dashboard** | `/api/trips/:id/dashboard` | Summary Cards, Budget Status, Recent Expenses |
| **Notifications** | `/api/notifications` | List Notifications, Unread Count, Mark Read (`/:id/read`), Mark All Read |
| **Activity History** | `/api/trips/:id/history` | Paginated Event Audit Log |
| **Settlement** | `/api/trips/:id/settlement` | Live Preview, Finalize Settlement (`/finalize`), Get Final Snapshot (`/final`) |
| **Trip Closure** | `/api/trips/:id/closure` | Get Closure Status, Confirm Stage (`/confirmations`) |

---

## Troubleshooting & Technical Notes

- **`npm test` fails with "TEST_DATABASE_URL is not set"**:
  Expected security behavior. Create `tripledger_test` and export `TEST_DATABASE_URL` before running tests.
- **Backend exits on startup with "Missing required environment variable(s)"**:
  `backend/.env` is missing `JWT_SECRET` or `DATABASE_URL`. Copy `backend/.env.example` and fill in valid values.
- **CORS error in browser console**:
  Verify `CORS_ORIGIN` in `backend/.env` matches the exact frontend origin (`https://trip-ledger.in`).
- **Google Sign-In button missing**:
  `VITE_GOOGLE_CLIENT_ID` is omitted in `frontend/.env`. Email/password authentication remains fully operational.
- **Join code lookup returns 404**:
  Join codes are 7 characters and matched case-insensitively. Verify the code exists and that the user is not already a member.

---

## Final Project Status

**TripLedger is complete, verified, security-audited, and operational in production.**

- **Application Development**: Complete (Phases 1 through 9.9.9)
- **Production Infrastructure**: Complete (Vercel + Render + Supabase)
- **Custom Domain**: Active (`https://trip-ledger.in`)
- **Database State**: 8/8 migrations applied & verified
- **Test Baseline**: 265/265 backend tests, 43/43 frontend tests passing
- **Security Audit**: Phase 10.10 PASS
- **Documentation**: Finalized
