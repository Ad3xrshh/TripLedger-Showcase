# TripLedger

A trustworthy shared trip/expense ledger for groups and families — not just
a basic expense-splitting calculator. People log expenses as they happen,
expenses can require verification depending on the trip's configuration,
families/couples can share a single settlement "unit" instead of splitting
everything per-person, and at the end of the trip TripLedger calculates a
final settlement showing exactly who owes whom.

## Status

All of Pass 1 (core data/business logic), Pass 2 (auth + product UI +
responsive polish), and Pass 3 (testing infrastructure + database
isolation) are complete. This document reflects Pass 4 (security/release
hardening). See the **Phase 8** and **Phase 9.7** deep-dive sections
further down for detailed design notes on the settlement/closure workflow
specifically — those predate this rewrite and remain accurate.

## Features

- Email/password registration and login (JWT), plus optional Google
  Sign-In (both frontend UI and backend token verification)
- Create a trip or join one via a 7-character join code
- Individual or shared ("family"/group) settlement units
- Expense logging with configurable verification: automatic, member
  approval, or tiered approval rules
- Budget tracking (fixed total, fixed per-person, or unlimited)
- Fair-share calculation across settlement units, with historical
  integrity — moving a member to a different unit later never rewrites
  the settlement-unit attribution of expenses they already paid
- Trip closure workflow with a ledger freeze: once a trip is closed,
  expenses, approvals, and settlement-unit membership all become
  read-only, enforced at the API level (not just hidden in the UI)
- Finalized settlements are snapshotted (balances + included expense IDs)
  so later changes to live trip data can't retroactively alter a
  historical settlement

## Tech stack

- **Backend:** Node.js, Express, PostgreSQL (`pg`), `node-pg-migrate`,
  JWT (`jsonwebtoken`), `bcrypt`, Zod validation, Helmet, CORS,
  `express-rate-limit`
- **Frontend:** React, Vite, plain CSS (no component library), Vitest +
  Testing Library for tests

## Prerequisites

- Node.js 20+ and npm
- PostgreSQL 14+ running locally (or reachable via a connection string)

## Environment setup

Neither `backend/.env` nor `frontend/.env` is committed — copy the
`.env.example` in each directory and fill in real values:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

**Backend** (`backend/.env.example` documents these against what the
source code actually reads):

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Your local Postgres connection string |
| `TEST_DATABASE_URL` | for running tests | A **separate** database — see Testing below. The app refuses to start under `NODE_ENV=test` without this rather than silently falling back to `DATABASE_URL` |
| `JWT_SECRET` | yes | Long random string. The server now fails fast on startup if this is missing, rather than booting and only breaking on the first login |
| `GOOGLE_CLIENT_ID` | optional | Only needed for Google Sign-In; email/password auth works without it |
| `PORT` | no | Defaults to `4000` |
| `CORS_ORIGIN` | no | Comma-separated frontend origin(s) allowed to call the API. Unset defaults to Vite's dev server origins (`http://localhost:5173`) — set this to your real frontend URL in any deployed environment |

**Frontend** (`frontend/.env.example`):

| Variable | Required | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | no | Defaults to `http://localhost:4000/api` |
| `VITE_GOOGLE_CLIENT_ID` | optional | Same Google Cloud OAuth client as the backend's `GOOGLE_CLIENT_ID` — two apps, one client ID. Omitting it simply hides the Google Sign-In button; email/password auth is unaffected |

Anything prefixed `VITE_` is bundled into the browser build and is
**public** by construction (Vite's own behavior, not a TripLedger
choice) — never put a private/secret value in a `VITE_*` variable. A
Google OAuth *client ID* is meant to be public (it identifies the app,
not a secret); an OAuth *client secret* would not belong here, and this
project's Google Sign-In flow (ID-token verification) never needs one.

## Database setup

```bash
createdb tripledger
cd backend
npm install
npm run migrate:up
```

Verify:

```bash
curl http://localhost:4000/api/health
# {"status":"ok","dbTime":"..."}
```

## Running locally

**Backend:**

```bash
cd backend
npm install
npm run dev        # http://localhost:4000
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev         # http://localhost:5173
```

## Testing

TripLedger tests run against a **dedicated test database**, never your
development database:

```bash
createdb tripledger_test
export TEST_DATABASE_URL=postgresql://<user>:<password>@localhost:5432/tripledger_test
cd backend
npm run test:migrate   # applies migrations to tripledger_test specifically
npm test                # sets NODE_ENV=test itself, which selects TEST_DATABASE_URL
```

If `TEST_DATABASE_URL` isn't set while `NODE_ENV=test`, the backend
throws immediately on startup rather than quietly running tests against
`DATABASE_URL` — this is intentional (see `backend/src/config/db.js`).

Backend test suite covers: auth (registration/login/`/api/auth/me`/Google
token verification), trip create/join/list/detail, the join-code
case-insensitivity fix, expense lifecycle and verification, and a
dedicated regression suite (`tests/integration/batch1SnapshotRegression.test.js`)
for historical payer-unit snapshots, zero-member settlement-unit
handling, closed-trip settlement-unit mutation guards, and finalized
settlement snapshot fields.

**Frontend:**

```bash
cd frontend
npm test             # Vitest
npm run build        # production build
npm run lint          # oxlint
```

Frontend tests cover the date/time formatting utilities and the Google
Sign-In button's graceful behavior when `VITE_GOOGLE_CLIENT_ID` is unset.

## Google OAuth

Google Sign-In is optional and the application works fully without it.
To enable it:

1. Create an OAuth 2.0 Client ID (Web application type) in
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Set the **same** client ID in both `backend/.env`'s `GOOGLE_CLIENT_ID`
   and `frontend/.env`'s `VITE_GOOGLE_CLIENT_ID`.
3. Restart both servers.

Never commit real Google credentials. `.env.example` files contain only
placeholders.

## Deployment

This repository does not include deployment automation — the high-level
process for a typical deployment:

1. Provision a PostgreSQL instance and run `npm run migrate:up` against
   it (with `DATABASE_URL` pointed at that instance).
2. Deploy the backend (`backend/`) as a standard Node.js/Express service.
   Set `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN` (your real frontend
   origin), and optionally `GOOGLE_CLIENT_ID` as environment variables on
   the hosting platform — never in source.
3. Build the frontend (`npm run build` in `frontend/`) and serve the
   resulting `dist/` as static assets, with `VITE_API_BASE_URL` set at
   build time to the deployed backend's URL.
4. Point DNS/your reverse proxy at both, and confirm `GET /api/health`
   responds before considering the deploy live.

No deployment has occurred as part of this pass — this section describes
the process, not a completed action.

## Security

- **Secrets:** never committed. `.env`/`.env.*` are gitignored except the
  tracked `.env.example` placeholders (see `.gitignore`). `JWT_SECRET`
  has no fallback default — the server won't start without it.
- **Passwords:** hashed with bcrypt, never returned in any API response,
  never logged.
- **CORS:** restricted to explicit origin(s) via `CORS_ORIGIN`, not a
  wildcard.
- **Rate limiting:** `/api/auth/register`, `/api/auth/login`, and
  `/api/auth/google` are rate-limited (20 requests / 15 minutes / IP) to
  blunt credential-stuffing and registration spam, via
  `backend/src/middleware/rateLimiter.js`.
- **Security headers:** Helmet is applied to every response.
- **Error responses:** unexpected server errors are logged in full
  server-side but only ever return a generic `{error: {code:
  "INTERNAL_ERROR", message: "Something went wrong"}}` to the client —
  no stack traces, SQL, or file paths are ever exposed (see
  `backend/src/middleware/errorHandler.js`).
- **Database:** connection string is entirely environment-driven, never
  hardcoded; the test suite cannot silently run against the development
  database (see Testing above).
- **Backups:** not automated by this repository — use your PostgreSQL
  host's standard backup/point-in-time-recovery tooling in any real
  deployment.

## Troubleshooting

**`npm test` fails immediately with "TEST_DATABASE_URL is not set"**
Expected behavior, not a bug — create `tripledger_test` and export
`TEST_DATABASE_URL` (see Testing above) before running tests.

**Backend exits immediately with "Missing required environment
variable(s)"**
`backend/.env` is missing `JWT_SECRET` and/or `DATABASE_URL` — copy
`backend/.env.example` and fill them in.

**Frontend can't reach the API / CORS errors in the browser console**
Confirm the backend is running and that its `CORS_ORIGIN` (if set)
includes the exact origin the frontend is served from, including
scheme and port.

**Google Sign-In button doesn't appear**
Expected when `VITE_GOOGLE_CLIENT_ID` isn't set — email/password auth
still works. See Google OAuth above to enable it.

**`404` joining a trip with a code that looks correct**
Join codes are matched case-insensitively as of this pass — if you're
running an older checkout, pull latest; typed and pasted codes should
now behave identically regardless of case.

---

## Phase 8 — Final settlement + trip closure workflow

Built directly on top of the Phase 7 fair-share/settlement calculation and
three tables that were already present since the Phase 1 init migration
but unused until now: `settlements`, `settlement_transactions`, and
`trip_closure_confirmations`. **No new tables were created.** The only
schema change is one small additive migration adding two indexes (see
"What changed" below).

### Concepts

- **Live preview vs. finalized settlement.** `GET /settlement` (Phase 7,
  unchanged) is a read-only calculation from *current* verified expenses -
  it recomputes every time and never writes anything. `POST
  /settlement/finalize` (Phase 8, new) permanently persists a snapshot of
  that calculation into `settlements` + `settlement_transactions`. Once
  finalized, that snapshot doesn't move even if expenses change afterward.
- **Trip lifecycle.** `trips.status` moves through
  `active -> closing -> closed` (the CHECK constraint already allowed this
  in Phase 1; Phase 8 is the first code to actually drive it).
- **Two closure confirmation stages**, each requiring every *currently
  active* trip member to confirm before it's considered complete:
  - `expenses_complete` - "I'm not adding any more expenses." The trip
    moves from `active` to `closing` the moment the *first* such
    confirmation lands (this only marks that the process has started -
    completion is tracked via the confirmation rows themselves, not the
    status string).
  - `final_settlement` - "I've seen and accept the finalized settlement."
    Can only be confirmed after a settlement has been finalized. The trip
    transitions from `closing` to `closed` automatically, in the same
    transaction as whichever confirmation completes the set - there is no
    separate "close trip" endpoint.

### New API endpoints

All routes below require `Authorization: Bearer <token>` and trip
membership (same `requireAuth` + `requireTripMembership` middleware as
every other trip-scoped route; a non-member or unauthenticated caller gets
the same 401/404 treatment as the rest of the app).

- **`POST /api/trips/:tripId/settlement/finalize`** — Owner/admin only.
  Computes the settlement using the exact same algorithm as the Phase 7
  preview and persists it. Requires every active member to have already
  confirmed `expenses_complete`, and the trip to not already be closed.
  **Idempotent**: calling it again after a settlement already exists
  returns that same persisted settlement (`alreadyFinalized: true`)
  instead of erroring or recomputing.
- **`GET /api/trips/:tripId/settlement/final`** — Any trip member.
  Retrieves the persisted final settlement + its transactions. `404
  SETTLEMENT_NOT_FINALIZED` if `finalize` hasn't been called yet.
- **`POST /api/trips/:tripId/closure/confirmations`** — Any active trip
  member, for themselves only (`{ "stage": "expenses_complete" |
  "final_settlement" }`). Self-service, idempotent (confirming the same
  stage twice returns `alreadyConfirmed: true`, not an error).
- **`GET /api/trips/:tripId/closure`** — Any trip member. Returns current
  trip status, whether the settlement is finalized, and per-stage
  confirmation progress (`confirmedCount`, `totalActiveMembers`,
  `allConfirmed`, `missingMemberIds`) - enough for a client to render
  "waiting on 2 of 4 members" without guessing.

### State-transition / error rules

| Situation | Response |
|---|---|
| Finalize without every active member confirming `expenses_complete` | `409 EXPENSES_NOT_COMPLETE` |
| Finalize by a non-owner/admin member | `403 FORBIDDEN` |
| Finalize an already-closed trip | `409 TRIP_ALREADY_CLOSED` |
| Confirm `final_settlement` before finalize has run | `409 SETTLEMENT_NOT_FINALIZED` |
| Confirm any stage on an already-closed trip | `409 TRIP_ALREADY_CLOSED` |
| Get final settlement before it's finalized | `404 SETTLEMENT_NOT_FINALIZED` |
| Non-member / unauthenticated access to any Phase 8 route | `404` / `401` (same non-leaking convention as the rest of the app) |
| Repeat finalize / repeat confirmation | Idempotent success, not an error |

### What changed (files added/modified)

**Added:**
- `src/migrations/1700000000200_add-phase8-settlement-closure-indexes.sql`
  — two additive indexes only (`settlement_transactions(settlement_id)`,
  `trip_closure_confirmations(trip_id, stage)`); no table/column changes.
- `src/repositories/settlementRepository.js` — persistence for finalized
  settlements + their transactions.
- `src/repositories/tripClosureRepository.js` — persistence for closure
  confirmations.
- `src/services/tripClosure/closureRules.js` — pure, DB-free
  "has everyone confirmed" logic (same convention as
  `services/settlement/settlementAlgorithm.js`), independently unit-tested.
- `src/services/TripClosureService.js` — the confirmation workflow.
- `src/controllers/tripClosureController.js`, `src/routes/closureRoutes.js`,
  `src/validators/tripClosureValidators.js`.
- `tests/unit/closureRules.test.js` (8 tests, DB-free).
- `tests/integration/phase8.test.js` (28 tests, requires PostgreSQL - see
  Testing below).

**Modified (additive only — no existing exported function's behavior was changed):**
- `src/repositories/tripRepository.js` — added `updateTripStatus`.
- `src/services/SettlementService.js` — internally refactored to extract
  the Phase 7 calculation into a shared, reused helper
  (`computeSettlementCalculation`); `getSettlementSummary`'s inputs,
  outputs, and behavior are byte-for-byte unchanged (verified by the
  pre-existing `settlementAlgorithm.test.js` unit suite still passing
  unmodified — 26/26 green). Added `finalizeSettlement` and
  `getFinalizedSettlement`.
- `src/controllers/settlementController.js` — added `finalizeSettlement`,
  `getFinalizedSettlement` controller functions; `getSettlement` untouched.
- `src/routes/settlementRoutes.js` — added `POST /finalize` and
  `GET /final`; existing `GET /` route untouched.
- `src/services/NotificationService.js` — added two new entries to
  `NOTIFICATION_TYPES` (`SETTLEMENT_FINALIZED`, `TRIP_CLOSED`); no
  existing type or function changed.
- `src/index.js` — mounted the new closure routes; no existing route
  mount changed.

**No dependencies added.** Phase 8 uses only what Phase 1-7 already
depended on (`zod` for validation, `pg`/`withTransaction` for
transactions, no new packages in `package.json`).

### Testing

**Verified by Claude in this environment**, without a live PostgreSQL
connection or a Postgres-reachable network:
- `node --check` (syntax) on every file in `src/` and `tests/` — all pass.
- Every new/modified module (`settlementRepository.js`,
  `tripClosureRepository.js`, `tripRepository.js`, `SettlementService.js`,
  `TripClosureService.js`, `closureRules.js`, `NotificationService.js`,
  both controllers, both route files, the validator) imports cleanly with
  no resolution/export errors.
- All DB-independent unit tests actually executed and passed:
  - `tests/unit/closureRules.test.js` — **8/8 passed** (new, Phase 8).
  - `tests/unit/settlementAlgorithm.test.js` — **26/26 passed**
    (pre-existing Phase 7 tests, run unmodified — confirms the settlement
    math Phase 8 reuses was not altered).
  - `tests/unit/BudgetService.test.js`, `joinCode.test.js`, `jwt.test.js`
    — all passed.
  - `tests/unit/password.test.js` could **not** be run in this sandbox: it
    depends on `bcrypt`'s native binary, which in this ZIP was compiled
    for macOS and fails to load (`invalid ELF header`) on this Linux
    sandbox. This is a pre-existing cross-platform artifact unrelated to
    Phase 8 - the same failure occurs running Phase 7's own
    `password.test.js` unmodified, and will not occur on your Mac where it
    was originally built.

**Not run in this environment (requires your Mac):**
- `tests/integration/phase8.test.js` (28 tests) and every existing
  integration test (`auth.test.js`, `trips.test.js`, `expenses.test.js`,
  `budget.test.js`, `expenseApproval.test.js`, `phase6.test.js`,
  `phase7.test.js`) — all require a live PostgreSQL connection, which this
  sandbox does not have (`ECONNREFUSED 127.0.0.1:5432`, confirmed directly)
  and cannot reach over the network. This is the same limitation that
  applies to Phase 7's own integration suite in this sandbox — nothing
  Phase 8-specific.

**Run this on your Mac to verify everything, including Phase 8:**
```bash
cd backend
npm install
npm run migrate:up      # applies the new Phase 8 index migration on top of your existing schema
npm test                # runs unit + integration, all phases including Phase 8
```
Expected: all pre-existing Phase 1-7 tests continue to pass exactly as
before (regression-free), plus the new `closureRules.test.js` (8 tests)
and `phase8.test.js` (28 tests) pass.

`phase8.test.js` covers: happy-path finalize + persistence, settlement
transaction persistence, repeated-finalize idempotency (including a direct
`COUNT(*)` check that `settlements` never gets a second row), closure
confirmations for both stages, rejection when `expenses_complete` isn't
unanimous, owner/admin-only finalize authorization, unauthenticated and
non-member rejection, invalid state transitions (confirming
`final_settlement` too early, acting on an already-closed trip), duplicate
confirmations, the full lifecycle ending in an auto-closed trip,
cross-trip isolation, and two regression checks confirming the Phase 7
live preview endpoint's behavior and "never writes" guarantee are
unchanged.

### Known limitations / deliberate scope boundaries

- Finalizing does **not** lock the underlying expenses table - Phase 8 was
  scoped to the closure/settlement workflow itself, not to adding new
  expense-locking behavior to `ExpenseService` (out of scope per "don't
  invent functionality unrelated to Phase 8"). In practice, requiring
  every active member to confirm `expenses_complete` before finalize is
  allowed is the intended social/process gate for this.
- If a trip's active membership changes after some (but not all) members
  have confirmed a stage, the newly-active member set is what's checked
  going forward (a departed member's earlier confirmation stops counting;
  a newly-joined member is required to confirm) - this is deliberate (see
  `closureRules.js` comments and its dedicated unit tests) rather than a
  gap.

## Phase 9.7 — Trip closure (frontend integration + closed-trip guards)

The Phase 8 closure/settlement backend (`TripClosureService`,
`SettlementService`, routes at `/api/trips/:tripId/closure` and
`/api/trips/:tripId/settlement`) was already complete, tested (C1-C28,
`closureRules.test.js`), and unchanged by this phase. Phase 9.7 did two
things: closed a real backend gap that phase 8's own "known limitations"
note above flagged, and built the frontend UI that its own `SettlementPanel`
and `closure.js` comments explicitly deferred to "Phase 9.7".

### 1. Closed-trip mutation guards (backend)

Inspection showed `ExpenseService.createExpense/updateExpense` and
`ExpenseApprovalService.approveExpense/rejectExpense/createApprovalRule`
had no check against `trip.status`, so a closed trip could still silently
accept new/edited expenses and approval-rule changes. Each now fetches the
trip (reusing an existing fetch where one was already present) and rejects
with the same `409 TRIP_ALREADY_CLOSED` code `SettlementService`/
`TripClosureService` already use for the same condition — no new error
code was introduced. This directly resolves the "expenses table isn't
locked" limitation noted under Phase 8 above.

Affected functions, all in `backend/src/services/`:
- `ExpenseService.createExpense`
- `ExpenseService.updateExpense`
- `ExpenseApprovalService.approveExpense`
- `ExpenseApprovalService.rejectExpense`
- `ExpenseApprovalService.createApprovalRule`

### 2. Frontend: trip closure UI

New components under `frontend/src/components/closure/`:
- **`TripClosurePanel.jsx`** — the active/closing-trip closure workflow:
  a member-by-member checklist (✓/○ by name) for the `expenses_complete`
  stage, the finalized-settlement snapshot once available, and a second
  checklist + self-service confirm button for the `final_settlement`
  stage. Self-fetches `GET .../closure` and, once finalized,
  `GET .../settlement/final` — same self-fetching convention as
  `SettlementPanel`/`ExpenseVerificationPanel`/`ApprovalRulesPanel`.
- **`TripClosedState.jsx`** — rendered once the backend reports
  `status: 'closed'`: an explicit read-only banner, settlement/final
  settlement/expense-lock status, and the full list of members who
  confirmed.

Deliberately does **not** duplicate `SettlementPanel`'s live balance
preview or its owner/admin "Finalize settlement" button — those already
exist, are already tested, and Phase 9.7 was scoped to integrate with them,
not replace them. All business logic (fair-share math, closure eligibility,
who's allowed to finalize, when the trip transitions to `closed`) stays
server-side; these components only request and render backend state via
the pre-existing `frontend/src/api/closure.js` and `settlement.js` — no new
API files were created.

### 3. Trip Detail integration

`frontend/src/pages/TripDetailPage.jsx`: renders `<TripClosurePanel>` after
`<SettlementPanel>`; the "Coming next → Trip closure (Phase 9.7)"
placeholder is gone now that it's implemented (`UPCOMING_SECTIONS` is now
empty, and the "Coming next" block only renders when it isn't). The
"Add expense" link is hidden once `trip.status === 'closed'`.

### 4. Closed-trip read-only experience elsewhere

Small, additive props (all default to "no change in behavior" so nothing
existing regresses) so the UI doesn't offer actions the backend will now
reject:
- `ApprovalRulesPanel` gained `isTripClosed` (default `false`) — hides the
  create-rule form when closed; the configured-rules list stays visible.
- `ExpenseVerificationPanel` gained `isTripClosed` (default `false`) —
  treated like a non-pending expense for the approve/reject buttons;
  approval history/stats stay visible.
- `ExpenseDetailPage`'s existing `isEditable` check now also requires the
  trip not be closed.
- `ExpensesPage`'s two "Add expense" links are hidden once closed.

Viewing (dashboard, history, notifications, expenses list/detail,
settlement, final settlement) is untouched and remains available on a
closed trip, since none of those are mutations and the backend never
restricted them.

### Testing

**PASS (executed in this sandbox):**
- `node --check` on every backend file under `src/` and every file under
  `tests/` (not just the ones touched this pass) — no syntax errors.
- `cd frontend && npm run build` — succeeded, 162 modules transformed
  (159 baseline + 3 new closure files), no build errors.
- `cd frontend && npm run lint` — 0 errors, exactly the same one
  pre-existing `AuthContext.jsx` Fast Refresh warning as the 9.6 baseline;
  no new warnings introduced.

**Fixed while reviewing:** `phase9_7.test.js`'s D1-D5 assertions originally
read `data.code`, but `errorHandler.js` nests errors as
`{ error: { code, message } }` (confirmed against every other error
assertion in `phase8.test.js`, which all use `data.error.code`) — those
five assertions would have failed against a live server despite the
underlying 409/`TRIP_ALREADY_CLOSED` behavior being correct. Corrected to
`data.error.code` before packaging; `node --check` and a full manual
trace of every route/response shape referenced in the file (registration,
trip creation, expense CRUD, approval, closure confirmation, settlement
finalize) against the actual controllers/services confirm the rest of the
file is accurate.

**STATIC VERIFIED (inspected, not executed):**
- Every new/changed API call in `TripClosurePanel.jsx`/`TripClosedState.jsx`
  traced back to an existing, already-mounted route
  (`GET/POST /api/trips/:tripId/closure*`,
  `GET /api/trips/:tripId/settlement/final`) — no new endpoints invented.
- Every new component is actually imported and rendered
  (`TripClosurePanel` in `TripDetailPage.jsx`).
- New/changed props (`isTripClosed`) all default to the prior behavior, so
  every existing call site not updated to pass them is unaffected.

**NOT RUN (needs Postgres — your Mac):**
- `backend/tests/integration/phase9_7.test.js` (7 new tests: D1-D7) — needs
  a live Postgres connection this sandbox does not have.
- The full existing suite (217 baseline + 8 `closureRules` + 28 `phase8` +
  7 new `phase9_7` tests) — same reason.
- Manual multi-device browser testing of the full closure lifecycle.

```bash
cd backend
npm install
npm test   # expect 217 + new phase9_7.test.js tests (7) to all pass, 0 regressions
```

`phase9_7.test.js` covers: `createExpense`/`updateExpense`/`approveExpense`/
`rejectExpense`/`createApprovalRule` all rejecting with
`409 TRIP_ALREADY_CLOSED` once a trip is closed (D1-D5); a regression check
that the same five operations behave exactly as before on an active trip
(D6); and a check that `GET .../closure` and `GET .../settlement/final`
stay readable after closure (D7). It does not duplicate `phase8.test.js`'s
C1-C28 lifecycle coverage.

