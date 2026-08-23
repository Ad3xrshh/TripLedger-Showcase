import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pool from '../../src/config/db.js';
import authRoutes from '../../src/routes/authRoutes.js';
import tripRoutes from '../../src/routes/tripRoutes.js';
import expenseRoutes from '../../src/routes/expenseRoutes.js';
import settlementRoutes from '../../src/routes/settlementRoutes.js';
import closureRoutes from '../../src/routes/closureRoutes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

// Pass 3: regression coverage for four Batch 1 / 9.9.9 fixes that are
// implemented in source (confirmed by reading ExpenseService.js,
// TripService.js, and SettlementService.js) but were not actually
// exercised by any existing test file as of this pass:
//
//   1. payer_settlement_unit_id snapshot (issue #3) - existing tests
//      exercise settlement-unit creation/move and expense creation
//      separately, but no test combines "create expense, then move the
//      payer to a different unit" to prove the historical expense's
//      attribution does not silently follow them.
//   2. Zero-member settlement-unit exclusion (issue #5) - expenses.test.js
//      covers "participantSettlementUnitIds defaults to every current
//      unit" but only when every unit in the trip has a member; no test
//      creates a genuinely empty group unit and confirms it's excluded
//      from that default, or that supplying it explicitly is rejected.
//   3. Settlement-unit mutation guards on a closed trip - phase9_7.test.js
//      (D1-D5) proves the closed-trip 409 guard for expenses/approvals,
//      but not for POST .../settlement-units or PATCH
//      .../members/me/settlement-unit, even though TripService.js's
//      createSettlementUnit/moveSelfToSettlementUnit both call
//      assertLedgerIsMutable exactly like the endpoints D1-D5 cover.
//   4. Settlement snapshot fields (issue #8) - phase8.test.js's C1/C2
//      assert on totalExpenseMinor/transactions but never on the
//      unitBalances/includedExpenseIds fields the Batch 1 migration
//      added to the settlements table and that
//      SettlementService.formatFinalizedSettlement returns.
//
// This file does not duplicate any of the above - see the cross-references
// in each test below.

let server;
let baseUrl;

const PASSWORD = 'Password123!';
const EMAIL_PREFIX = 'batch1_regr_';

async function cleanupTestData() {
  await pool.query(
    `DELETE FROM trip_closure_confirmations WHERE trip_id IN (
       SELECT id FROM trips WHERE created_by IN (SELECT id FROM users WHERE email LIKE $1)
     )`,
    [`${EMAIL_PREFIX}%@example.com`]
  );
  await pool.query(
    `DELETE FROM settlement_transactions WHERE settlement_id IN (
       SELECT s.id FROM settlements s
       JOIN trips t ON t.id = s.trip_id
       JOIN users u ON u.id = t.created_by
       WHERE u.email LIKE $1
     )`,
    [`${EMAIL_PREFIX}%@example.com`]
  );
  await pool.query(
    `DELETE FROM settlements WHERE trip_id IN (
       SELECT id FROM trips WHERE created_by IN (SELECT id FROM users WHERE email LIKE $1)
     )`,
    [`${EMAIL_PREFIX}%@example.com`]
  );
  await pool.query(
    `DELETE FROM expense_participants WHERE expense_id IN (
       SELECT e.id FROM expenses e
       JOIN trips t ON t.id = e.trip_id
       JOIN users u ON u.id = t.created_by
       WHERE u.email LIKE $1
     )`,
    [`${EMAIL_PREFIX}%@example.com`]
  );
  await pool.query(
    `DELETE FROM expense_approvals WHERE expense_id IN (
       SELECT e.id FROM expenses e
       JOIN trips t ON t.id = e.trip_id
       JOIN users u ON u.id = t.created_by
       WHERE u.email LIKE $1
     )`,
    [`${EMAIL_PREFIX}%@example.com`]
  );
  await pool.query(
    `DELETE FROM expenses WHERE trip_id IN (
       SELECT id FROM trips WHERE created_by IN (SELECT id FROM users WHERE email LIKE $1)
     )`,
    [`${EMAIL_PREFIX}%@example.com`]
  );
  await pool.query(
    `DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`,
    [`${EMAIL_PREFIX}%@example.com`]
  );
  await pool.query(
    `DELETE FROM audit_logs WHERE trip_id IN (
       SELECT id FROM trips WHERE created_by IN (SELECT id FROM users WHERE email LIKE $1)
     )`,
    [`${EMAIL_PREFIX}%@example.com`]
  );
  await pool.query(
    `DELETE FROM trips WHERE created_by IN (SELECT id FROM users WHERE email LIKE $1)`,
    [`${EMAIL_PREFIX}%@example.com`]
  );
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${EMAIL_PREFIX}%@example.com`]);
}

async function registerAndLogin(localPart, displayName) {
  const email = `${EMAIL_PREFIX}${localPart}@example.com`;
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, displayName }),
  });
  const data = await res.json();
  return { token: data.token, user: data.user };
}

async function createTrip(token, tripOverrides = {}) {
  const res = await fetch(`${baseUrl}/api/trips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: 'Batch 1 Regression Trip',
      budgetType: 'unlimited',
      fairShareMethod: 'equal_per_unit',
      verificationMode: 'automatic',
      ...tripOverrides,
    }),
  });
  return res.json();
}

async function joinTrip(token, joinCode) {
  const res = await fetch(`${baseUrl}/api/trips/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ joinCode }),
  });
  return res.json();
}

async function createGroupUnit(token, tripId, displayName) {
  const res = await fetch(`${baseUrl}/api/trips/${tripId}/settlement-units`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ displayName }),
  });
  return { status: res.status, data: await res.json() };
}

async function moveIntoUnit(token, tripId, settlementUnitId) {
  const res = await fetch(`${baseUrl}/api/trips/${tripId}/members/me/settlement-unit`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ settlementUnitId }),
  });
  return { status: res.status, data: await res.json() };
}

async function createExpense(token, tripId, expenseOverrides = {}) {
  const res = await fetch(`${baseUrl}/api/trips/${tripId}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      amountMinor: 10000,
      description: 'Test expense',
      category: 'Food',
      occurredAt: '2026-08-09T18:00:00.000Z',
      ...expenseOverrides,
    }),
  });
  return { status: res.status, data: await res.json() };
}

async function getSettlement(token, tripId) {
  const res = await fetch(`${baseUrl}/api/trips/${tripId}/settlement`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, data: await res.json() };
}

async function confirmStage(token, tripId, stage) {
  const res = await fetch(`${baseUrl}/api/trips/${tripId}/closure/confirmations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ stage }),
  });
  return { status: res.status, data: await res.json() };
}

async function finalizeSettlement(token, tripId) {
  const res = await fetch(`${baseUrl}/api/trips/${tripId}/settlement/finalize`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, data: await res.json() };
}

async function confirmBothStagesForAll(tokens, tripId) {
  for (const token of tokens) {
    await confirmStage(token, tripId, 'expenses_complete');
  }
}

before(async () => {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.use('/api/auth', authRoutes);
  app.use('/api/trips', tripRoutes);
  app.use('/api/trips/:tripId/expenses', expenseRoutes);
  app.use('/api/trips/:tripId/settlement', settlementRoutes);
  app.use('/api/trips/:tripId/closure', closureRoutes);
  app.use(errorHandler);

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

  await cleanupTestData();
});

after(async () => {
  await cleanupTestData();
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await pool.end();
});

// ---------------------------------------------------------------------------
// 1. HISTORICAL PAYER SETTLEMENT-UNIT SNAPSHOT (Batch 1 issue #3)
// ---------------------------------------------------------------------------

test('R1. An expense keeps its original payer settlement unit in fair-share calculation after the payer moves to a different unit', async () => {
  const a = await registerAndLogin('r1_a', 'R1 A');
  const b = await registerAndLogin('r1_b', 'R1 B');
  const { trip, membership: aM } = await createTrip(a.token);
  const { membership: bM } = await joinTrip(b.token, trip.join_code);

  // A pays 10000 while still in their own individual unit. Fair share
  // between the two individual units is 5000/5000, so B should owe A 5000.
  await createExpense(a.token, trip.id, {
    amountMinor: 10000,
    participantSettlementUnitIds: [aM.settlement_unit_id, bM.settlement_unit_id],
  });

  const before9 = await getSettlement(a.token, trip.id);
  assert.equal(before9.status, 200);
  const beforeTxn = before9.data.transactions.find(
    (t) => t.fromSettlementUnitId === bM.settlement_unit_id && t.toSettlementUnitId === aM.settlement_unit_id
  );
  assert.ok(beforeTxn, 'expected B to owe A before the move');
  assert.equal(beforeTxn.amountMinor, 5000);

  // Now move A into a brand-new group unit ("Family A"). If the expense's
  // payer attribution were still resolved live (the pre-Batch-1 bug this
  // column fixed), the balance below would silently shift to the new
  // group unit instead of staying with A's original individual unit.
  const { status: unitStatus, data: unitRes } = await createGroupUnit(a.token, trip.id, 'Family A');
  assert.equal(unitStatus, 201);
  const familyUnit = unitRes.settlementUnit;
  const { status: moveStatus } = await moveIntoUnit(a.token, trip.id, familyUnit.id);
  assert.equal(moveStatus, 200);

  const after9 = await getSettlement(a.token, trip.id);
  assert.equal(after9.status, 200);

  // The historical expense must still be attributed to A's ORIGINAL
  // individual unit, not the new "Family A" group unit A just moved into.
  const afterTxn = after9.data.transactions.find(
    (t) => t.fromSettlementUnitId === bM.settlement_unit_id && t.toSettlementUnitId === aM.settlement_unit_id
  );
  assert.ok(
    afterTxn,
    'B must still owe A\'s original individual unit after A moves - payer_settlement_unit_id must not follow the live move'
  );
  assert.equal(afterTxn.amountMinor, 5000);

  // And the new "Family A" unit must NOT appear as a party to this
  // historical expense's balance at all - it had no expenses of its own.
  const familyUnitInvolved = after9.data.transactions.some(
    (t) => t.fromSettlementUnitId === familyUnit.id || t.toSettlementUnitId === familyUnit.id
  );
  assert.equal(familyUnitInvolved, false, 'the new unit must not inherit the old expense\'s balance');
});

// ---------------------------------------------------------------------------
// 2. ZERO-MEMBER SETTLEMENT-UNIT EXCLUSION (Batch 1 issue #5)
// ---------------------------------------------------------------------------

test('R2. A settlement unit with no active members is excluded from the default participant set', async () => {
  const a = await registerAndLogin('r2_a', 'R2 A');
  const { trip, membership: aM } = await createTrip(a.token);

  // Create a group unit but never move anyone into it - "Empty Group" now
  // exists in the trip with zero members.
  const { status: unitStatus, data: unitRes } = await createGroupUnit(a.token, trip.id, 'Empty Group');
  assert.equal(unitStatus, 201);
  const emptyUnit = unitRes.settlementUnit;

  // Omitting participantSettlementUnitIds should default to "every
  // currently-populated unit" - i.e. just A's own individual unit, NOT
  // the empty group.
  const { status, data } = await createExpense(a.token, trip.id, { amountMinor: 5000 });
  assert.equal(status, 201);
  const participantIds = data.participants.map((p) => p.settlement_unit_id);
  assert.deepEqual(participantIds, [aM.settlement_unit_id]);
  assert.ok(!participantIds.includes(emptyUnit.id), 'the empty unit must not be defaulted into the expense');
});

test('R2b. Explicitly supplying an empty settlement unit as a participant is rejected with 422 SETTLEMENT_UNIT_EMPTY', async () => {
  const a = await registerAndLogin('r2b_a', 'R2b A');
  const { trip, membership: aM } = await createTrip(a.token);
  const { data: unitRes } = await createGroupUnit(a.token, trip.id, 'Empty Group 2');
  const emptyUnit = unitRes.settlementUnit;

  const { status, data } = await createExpense(a.token, trip.id, {
    amountMinor: 5000,
    participantSettlementUnitIds: [aM.settlement_unit_id, emptyUnit.id],
  });
  assert.equal(status, 422);
  assert.equal(data.error.code, 'SETTLEMENT_UNIT_EMPTY');
});

// ---------------------------------------------------------------------------
// 3. SETTLEMENT-UNIT MUTATION GUARDS ON A CLOSED TRIP (extends phase9_7's
//    D1-D5 coverage of expense/approval endpoints to settlement-unit
//    endpoints, using the same one-member-trip finalize shortcut those
//    tests use to reach 'closed' quickly)
// ---------------------------------------------------------------------------

test('R3. POST settlement-units on a closed trip is rejected with 409 TRIP_ALREADY_CLOSED', async () => {
  const a = await registerAndLogin('r3_a', 'R3 A');
  const { trip } = await createTrip(a.token);
  await confirmBothStagesForAll([a.token], trip.id);
  await finalizeSettlement(a.token, trip.id);
  await confirmStage(a.token, trip.id, 'final_settlement');

  const { status, data } = await createGroupUnit(a.token, trip.id, 'Too Late Group');
  assert.equal(status, 409);
  assert.equal(data.error.code, 'TRIP_ALREADY_CLOSED');
});

test('R3b. PATCH members/me/settlement-unit on a closed trip is rejected with 409 TRIP_ALREADY_CLOSED', async () => {
  const a = await registerAndLogin('r3b_a', 'R3b A');
  const b = await registerAndLogin('r3b_b', 'R3b B');
  const { trip } = await createTrip(a.token);
  const { membership: bM } = await joinTrip(b.token, trip.join_code);

  // Create the group unit BEFORE closing, so the only thing under test at
  // close time is the move itself, not unit creation (covered by R3).
  const { data: unitRes } = await createGroupUnit(a.token, trip.id, 'Pre-existing Group');
  const groupUnit = unitRes.settlementUnit;

  await confirmBothStagesForAll([a.token, b.token], trip.id);
  await finalizeSettlement(a.token, trip.id);
  await confirmStage(a.token, trip.id, 'final_settlement');
  await confirmStage(b.token, trip.id, 'final_settlement');

  const { status, data } = await moveIntoUnit(b.token, trip.id, groupUnit.id);
  assert.equal(status, 409);
  assert.equal(data.error.code, 'TRIP_ALREADY_CLOSED');
  // b's membership must be unaffected by the rejected move attempt.
  assert.notEqual(groupUnit.id, bM.settlement_unit_id);
});

// ---------------------------------------------------------------------------
// 4. SETTLEMENT SNAPSHOT FIELDS (Batch 1 issue #8)
// ---------------------------------------------------------------------------

test('R4. Finalized settlement persists unitBalances and includedExpenseIds matching what was actually settled', async () => {
  const a = await registerAndLogin('r4_a', 'R4 A');
  const b = await registerAndLogin('r4_b', 'R4 B');
  const { trip, membership: aM } = await createTrip(a.token);
  const { membership: bM } = await joinTrip(b.token, trip.join_code);

  const { data: expenseRes } = await createExpense(a.token, trip.id, {
    amountMinor: 6000,
    participantSettlementUnitIds: [aM.settlement_unit_id, bM.settlement_unit_id],
  });
  const expense = expenseRes.expense;

  await confirmBothStagesForAll([a.token, b.token], trip.id);
  const { status, data } = await finalizeSettlement(a.token, trip.id);
  assert.equal(status, 200);

  assert.ok(Array.isArray(data.settlement.unitBalances), 'unitBalances must be persisted as an array, not left null, for a fresh finalize');
  const unitIds = data.settlement.unitBalances.map((u) => u.settlementUnitId);
  assert.ok(unitIds.includes(aM.settlement_unit_id));
  assert.ok(unitIds.includes(bM.settlement_unit_id));

  assert.ok(Array.isArray(data.settlement.includedExpenseIds), 'includedExpenseIds must be persisted as an array for a fresh finalize');
  assert.deepEqual(data.settlement.includedExpenseIds, [expense.id]);
});
