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

let server;
let baseUrl;

const PASSWORD = 'Password123!';
const EMAIL_PREFIX = 'phase8_test_';

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
      name: 'Phase 8 Test Trip',
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

async function finalizeSettlement(token, tripId) {
  const res = await fetch(`${baseUrl}/api/trips/${tripId}/settlement/finalize`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, data: await res.json() };
}

async function getFinalSettlement(token, tripId) {
  const res = await fetch(`${baseUrl}/api/trips/${tripId}/settlement/final`, {
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

async function getClosureStatus(token, tripId) {
  const res = await fetch(`${baseUrl}/api/trips/${tripId}/closure`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, data: await res.json() };
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

// Drives a two-member trip all the way through both confirmation stages
// (from each member's own token) so tests that need a fully-closed trip
// don't have to repeat the same four calls inline.
async function confirmBothStagesForAll(tokens, tripId) {
  for (const token of tokens) {
    await confirmStage(token, tripId, 'expenses_complete');
  }
}

// ---------------------------------------------------------------------------
// HAPPY PATH: FINALIZE + PERSIST
// ---------------------------------------------------------------------------

test('C1. Happy path: finalize settlement persists a settlement + its transactions', async () => {
  const a = await registerAndLogin('c1_a', 'C1 A');
  const b = await registerAndLogin('c1_b', 'C1 B');
  const { trip, membership: aM } = await createTrip(a.token);
  const { membership: bM } = await joinTrip(b.token, trip.join_code);

  await createExpense(a.token, trip.id, {
    amountMinor: 10000,
    participantSettlementUnitIds: [aM.settlement_unit_id, bM.settlement_unit_id],
  });

  await confirmBothStagesForAll([a.token, b.token], trip.id);

  const { status, data } = await finalizeSettlement(a.token, trip.id);
  assert.equal(status, 200);
  assert.equal(data.alreadyFinalized, false);
  assert.equal(data.settlement.totalExpenseMinor, 10000);
  assert.equal(data.settlement.transactions.length, 1);
  assert.equal(data.settlement.transactions[0].amountMinor, 5000);
  assert.ok(data.settlement.id);
  assert.ok(data.settlement.generatedAt);
});

test('C2. Finalized settlement can be retrieved via GET /settlement/final', async () => {
  const a = await registerAndLogin('c2_a', 'C2 A');
  const b = await registerAndLogin('c2_b', 'C2 B');
  const { trip, membership: aM } = await createTrip(a.token);
  const { membership: bM } = await joinTrip(b.token, trip.join_code);

  await createExpense(a.token, trip.id, {
    amountMinor: 8000,
    participantSettlementUnitIds: [aM.settlement_unit_id, bM.settlement_unit_id],
  });
  await confirmBothStagesForAll([a.token, b.token], trip.id);
  await finalizeSettlement(a.token, trip.id);

  const { status, data } = await getFinalSettlement(b.token, trip.id);
  assert.equal(status, 200);
  assert.equal(data.totalExpenseMinor, 8000);
  assert.equal(data.transactions.length, 1);
  assert.equal(data.transactions[0].fromSettlementUnitId, bM.settlement_unit_id);
  assert.equal(data.transactions[0].toSettlementUnitId, aM.settlement_unit_id);
  assert.equal(data.transactions[0].amountMinor, 4000);
});

test('C3. GET /settlement/final before finalization returns 404 SETTLEMENT_NOT_FINALIZED', async () => {
  const a = await registerAndLogin('c3_a', 'C3 A');
  const { trip } = await createTrip(a.token);

  const { status, data } = await getFinalSettlement(a.token, trip.id);
  assert.equal(status, 404);
  assert.equal(data.error.code, 'SETTLEMENT_NOT_FINALIZED');
});

test('C4. Finalized settlement matches conservation: transaction total equals total debtor exposure', async () => {
  const a = await registerAndLogin('c4_a', 'C4 A');
  const b = await registerAndLogin('c4_b', 'C4 B');
  const c = await registerAndLogin('c4_c', 'C4 C');
  const { trip, membership: aM } = await createTrip(a.token);
  const { membership: bM } = await joinTrip(b.token, trip.join_code);
  const { membership: cM } = await joinTrip(c.token, trip.join_code);
  const units = [aM.settlement_unit_id, bM.settlement_unit_id, cM.settlement_unit_id];

  await createExpense(a.token, trip.id, { amountMinor: 777, participantSettlementUnitIds: units });
  await createExpense(b.token, trip.id, {
    amountMinor: 233,
    participantSettlementUnitIds: [aM.settlement_unit_id, bM.settlement_unit_id],
  });

  await confirmBothStagesForAll([a.token, b.token, c.token], trip.id);
  const { data } = await finalizeSettlement(a.token, trip.id);

  const txnTotal = data.settlement.transactions.reduce((s, t) => s + t.amountMinor, 0);
  // Same live preview, computed just before finalize, gives the expected debtor exposure.
  const { data: preview } = await getSettlement(a.token, trip.id);
  const debtorTotal = preview.balances
    .filter((x) => x.netBalanceMinor < 0)
    .reduce((s, x) => s + Math.abs(x.netBalanceMinor), 0);
  assert.equal(txnTotal, debtorTotal);
});

// ---------------------------------------------------------------------------
// IDEMPOTENCY / DUPLICATE FINALIZATION
// ---------------------------------------------------------------------------

test('C5. Repeated finalize calls are idempotent - second call returns the same persisted settlement', async () => {
  const a = await registerAndLogin('c5_a', 'C5 A');
  const b = await registerAndLogin('c5_b', 'C5 B');
  const { trip, membership: aM } = await createTrip(a.token);
  const { membership: bM } = await joinTrip(b.token, trip.join_code);

  await createExpense(a.token, trip.id, {
    amountMinor: 6000,
    participantSettlementUnitIds: [aM.settlement_unit_id, bM.settlement_unit_id],
  });
  await confirmBothStagesForAll([a.token, b.token], trip.id);

  const first = await finalizeSettlement(a.token, trip.id);
  const second = await finalizeSettlement(a.token, trip.id);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(first.data.alreadyFinalized, false);
  assert.equal(second.data.alreadyFinalized, true);
  assert.equal(first.data.settlement.id, second.data.settlement.id);
  assert.deepEqual(first.data.settlement.transactions, second.data.settlement.transactions);
});

test('C6. Finalizing does not create a second row in settlements (UNIQUE(trip_id) never violated)', async () => {
  const a = await registerAndLogin('c6_a', 'C6 A');
  const b = await registerAndLogin('c6_b', 'C6 B');
  const { trip, membership: aM } = await createTrip(a.token);
  const { membership: bM } = await joinTrip(b.token, trip.join_code);

  await createExpense(a.token, trip.id, {
    amountMinor: 3000,
    participantSettlementUnitIds: [aM.settlement_unit_id, bM.settlement_unit_id],
  });
  await confirmBothStagesForAll([a.token, b.token], trip.id);

  await finalizeSettlement(a.token, trip.id);
  await finalizeSettlement(a.token, trip.id);
  await finalizeSettlement(a.token, trip.id);

  const result = await pool.query('SELECT COUNT(*)::int AS count FROM settlements WHERE trip_id = $1', [trip.id]);
  assert.equal(result.rows[0].count, 1);
});

// ---------------------------------------------------------------------------
// PRECONDITIONS: EXPENSES_COMPLETE GATE
// ---------------------------------------------------------------------------

test('C7. Finalize is rejected with 409 EXPENSES_NOT_COMPLETE if not all members confirmed', async () => {
  const a = await registerAndLogin('c7_a', 'C7 A');
  const b = await registerAndLogin('c7_b', 'C7 B');
  const { trip } = await createTrip(a.token);
  await joinTrip(b.token, trip.join_code);

  await confirmStage(a.token, trip.id, 'expenses_complete');
  // b never confirms.

  const { status, data } = await finalizeSettlement(a.token, trip.id);
  assert.equal(status, 409);
  assert.equal(data.error.code, 'EXPENSES_NOT_COMPLETE');
});

test('C8. Finalize is rejected if nobody has confirmed expenses_complete at all', async () => {
  const a = await registerAndLogin('c8_a', 'C8 A');
  const { trip } = await createTrip(a.token);

  const { status, data } = await finalizeSettlement(a.token, trip.id);
  assert.equal(status, 409);
  assert.equal(data.error.code, 'EXPENSES_NOT_COMPLETE');
});

// ---------------------------------------------------------------------------
// AUTHORIZATION
// ---------------------------------------------------------------------------

test('C9. A regular member (not owner/admin) cannot finalize the settlement', async () => {
  const a = await registerAndLogin('c9_a', 'C9 A');
  const b = await registerAndLogin('c9_b', 'C9 B');
  const { trip } = await createTrip(a.token);
  await joinTrip(b.token, trip.join_code);

  await confirmStage(a.token, trip.id, 'expenses_complete');
  await confirmStage(b.token, trip.id, 'expenses_complete');

  const { status, data } = await finalizeSettlement(b.token, trip.id);
  assert.equal(status, 403);
  assert.equal(data.error.code, 'FORBIDDEN');
});

test('C10. Trip owner CAN finalize the settlement', async () => {
  const a = await registerAndLogin('c10_a', 'C10 A');
  const { trip } = await createTrip(a.token);

  await confirmStage(a.token, trip.id, 'expenses_complete');
  const { status } = await finalizeSettlement(a.token, trip.id);
  assert.equal(status, 200);
});

test('C11. Unauthenticated finalize request is rejected with 401', async () => {
  const a = await registerAndLogin('c11_a', 'C11 A');
  const { trip } = await createTrip(a.token);

  const res = await fetch(`${baseUrl}/api/trips/${trip.id}/settlement/finalize`, { method: 'POST' });
  assert.equal(res.status, 401);
});

test('C12. Non-member cannot finalize a trip they do not belong to (404 non-leaking)', async () => {
  const a = await registerAndLogin('c12_a', 'C12 A');
  const outsider = await registerAndLogin('c12_outsider', 'C12 Outsider');
  const { trip } = await createTrip(a.token);

  const { status } = await finalizeSettlement(outsider.token, trip.id);
  assert.equal(status, 404);
});

// ---------------------------------------------------------------------------
// CLOSURE CONFIRMATIONS: expenses_complete
// ---------------------------------------------------------------------------

test('C13. First expenses_complete confirmation moves trip from active to closing', async () => {
  const a = await registerAndLogin('c13_a', 'C13 A');
  const { trip } = await createTrip(a.token);

  const before = await getClosureStatus(a.token, trip.id);
  assert.equal(before.data.status, 'active');

  await confirmStage(a.token, trip.id, 'expenses_complete');

  const after = await getClosureStatus(a.token, trip.id);
  assert.equal(after.data.status, 'closing');
});

test('C14. Duplicate expenses_complete confirmation by the same member is a no-op, not an error', async () => {
  const a = await registerAndLogin('c14_a', 'C14 A');
  const { trip } = await createTrip(a.token);

  const first = await confirmStage(a.token, trip.id, 'expenses_complete');
  const second = await confirmStage(a.token, trip.id, 'expenses_complete');

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(first.data.alreadyConfirmed, false);
  assert.equal(second.data.alreadyConfirmed, true);

  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM trip_closure_confirmations WHERE trip_id = $1 AND stage = 'expenses_complete'`,
    [trip.id]
  );
  assert.equal(result.rows[0].count, 1);
});

test('C15. Closure status accurately reports confirmed/missing members for expenses_complete', async () => {
  const a = await registerAndLogin('c15_a', 'C15 A');
  const b = await registerAndLogin('c15_b', 'C15 B');
  const { trip, membership: aM } = await createTrip(a.token);
  const { membership: bM } = await joinTrip(b.token, trip.join_code);

  await confirmStage(a.token, trip.id, 'expenses_complete');

  const { data } = await getClosureStatus(a.token, trip.id);
  assert.equal(data.stages.expenses_complete.confirmedCount, 1);
  assert.equal(data.stages.expenses_complete.totalActiveMembers, 2);
  assert.equal(data.stages.expenses_complete.allConfirmed, false);
  assert.deepEqual(data.stages.expenses_complete.missingMemberIds, [bM.id]);

  await confirmStage(b.token, trip.id, 'expenses_complete');
  const { data: after } = await getClosureStatus(a.token, trip.id);
  assert.equal(after.stages.expenses_complete.allConfirmed, true);
  assert.deepEqual(after.stages.expenses_complete.missingMemberIds, []);
});

test('C16. Invalid stage value is rejected with 422 VALIDATION_ERROR', async () => {
  const a = await registerAndLogin('c16_a', 'C16 A');
  const { trip } = await createTrip(a.token);

  const res = await fetch(`${baseUrl}/api/trips/${trip.id}/closure/confirmations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${a.token}` },
    body: JSON.stringify({ stage: 'not_a_real_stage' }),
  });
  assert.equal(res.status, 422);
  const data = await res.json();
  assert.equal(data.error.code, 'VALIDATION_ERROR');
});

// ---------------------------------------------------------------------------
// CLOSURE CONFIRMATIONS: final_settlement (invalid state transitions)
// ---------------------------------------------------------------------------

test('C17. Confirming final_settlement before the settlement is finalized is rejected with 409', async () => {
  const a = await registerAndLogin('c17_a', 'C17 A');
  const { trip } = await createTrip(a.token);
  await confirmStage(a.token, trip.id, 'expenses_complete');
  // Settlement never finalized.

  const { status, data } = await confirmStage(a.token, trip.id, 'final_settlement');
  assert.equal(status, 409);
  assert.equal(data.error.code, 'SETTLEMENT_NOT_FINALIZED');
});

test('C18. Confirming final_settlement while trip is still fully active (no expenses_complete at all) is also rejected', async () => {
  const a = await registerAndLogin('c18_a', 'C18 A');
  const { trip } = await createTrip(a.token);

  const { status, data } = await confirmStage(a.token, trip.id, 'final_settlement');
  assert.equal(status, 409);
  assert.equal(data.error.code, 'SETTLEMENT_NOT_FINALIZED');
});

// ---------------------------------------------------------------------------
// FULL LIFECYCLE: CLOSING THE TRIP
// ---------------------------------------------------------------------------

test('C19. Full lifecycle: confirm expenses_complete -> finalize -> confirm final_settlement -> trip closes', async () => {
  const a = await registerAndLogin('c19_a', 'C19 A');
  const b = await registerAndLogin('c19_b', 'C19 B');
  const { trip, membership: aM } = await createTrip(a.token);
  const { membership: bM } = await joinTrip(b.token, trip.join_code);

  await createExpense(a.token, trip.id, {
    amountMinor: 4000,
    participantSettlementUnitIds: [aM.settlement_unit_id, bM.settlement_unit_id],
  });

  await confirmStage(a.token, trip.id, 'expenses_complete');
  await confirmStage(b.token, trip.id, 'expenses_complete');

  const finalize = await finalizeSettlement(a.token, trip.id);
  assert.equal(finalize.status, 200);

  const mid = await getClosureStatus(a.token, trip.id);
  assert.equal(mid.data.status, 'closing');
  assert.equal(mid.data.settlementFinalized, true);

  const c1 = await confirmStage(a.token, trip.id, 'final_settlement');
  assert.equal(c1.status, 200);
  assert.equal(c1.data.status, 'closing'); // still waiting on b

  const c2 = await confirmStage(b.token, trip.id, 'final_settlement');
  assert.equal(c2.status, 200);
  assert.equal(c2.data.status, 'closed'); // b was the last confirmation

  const finalStatus = await getClosureStatus(a.token, trip.id);
  assert.equal(finalStatus.data.status, 'closed');
  assert.equal(finalStatus.data.stages.final_settlement.allConfirmed, true);
});

test('C20. Duplicate final_settlement confirmation after trip is already closed returns 409 TRIP_ALREADY_CLOSED', async () => {
  const a = await registerAndLogin('c20_a', 'C20 A');
  const { trip } = await createTrip(a.token);

  await confirmStage(a.token, trip.id, 'expenses_complete');
  await finalizeSettlement(a.token, trip.id);
  await confirmStage(a.token, trip.id, 'final_settlement'); // closes trip (single-member trip)

  const status = await getClosureStatus(a.token, trip.id);
  assert.equal(status.data.status, 'closed');

  const { status: httpStatus, data } = await confirmStage(a.token, trip.id, 'expenses_complete');
  assert.equal(httpStatus, 409);
  assert.equal(data.error.code, 'TRIP_ALREADY_CLOSED');
});

test('C21. Finalize after trip is already closed is rejected with 409 TRIP_ALREADY_CLOSED', async () => {
  const a = await registerAndLogin('c21_a', 'C21 A');
  const { trip } = await createTrip(a.token);

  await confirmStage(a.token, trip.id, 'expenses_complete');
  await finalizeSettlement(a.token, trip.id);
  await confirmStage(a.token, trip.id, 'final_settlement'); // closes (single-member)

  const { status, data } = await finalizeSettlement(a.token, trip.id);
  assert.equal(status, 409);
  assert.equal(data.error.code, 'TRIP_ALREADY_CLOSED');
});

test('C22. Duplicate final_settlement confirmation before trip closes is a no-op', async () => {
  const a = await registerAndLogin('c22_a', 'C22 A');
  const b = await registerAndLogin('c22_b', 'C22 B');
  const { trip } = await createTrip(a.token);
  await joinTrip(b.token, trip.join_code);

  await confirmStage(a.token, trip.id, 'expenses_complete');
  await confirmStage(b.token, trip.id, 'expenses_complete');
  await finalizeSettlement(a.token, trip.id);

  const first = await confirmStage(a.token, trip.id, 'final_settlement');
  const second = await confirmStage(a.token, trip.id, 'final_settlement');

  assert.equal(first.data.alreadyConfirmed, false);
  assert.equal(second.data.alreadyConfirmed, true);
  // Trip should still be 'closing' - b never confirmed final_settlement.
  assert.equal(second.data.status, 'closing');
});

// ---------------------------------------------------------------------------
// SECURITY: CROSS-TRIP / NON-MEMBER PROTECTION
// ---------------------------------------------------------------------------

test('C23. Non-member cannot confirm a closure stage for a trip they do not belong to', async () => {
  const a = await registerAndLogin('c23_a', 'C23 A');
  const outsider = await registerAndLogin('c23_outsider', 'C23 Outsider');
  const { trip } = await createTrip(a.token);

  const { status } = await confirmStage(outsider.token, trip.id, 'expenses_complete');
  assert.equal(status, 404);
});

test('C24. Non-member cannot read closure status for a trip they do not belong to', async () => {
  const a = await registerAndLogin('c24_a', 'C24 A');
  const outsider = await registerAndLogin('c24_outsider', 'C24 Outsider');
  const { trip } = await createTrip(a.token);

  const res = await fetch(`${baseUrl}/api/trips/${trip.id}/closure`, {
    headers: { Authorization: `Bearer ${outsider.token}` },
  });
  assert.equal(res.status, 404);
});

test('C25. Confirmations and finalization on one trip never affect a completely separate trip', async () => {
  const a = await registerAndLogin('c25_a', 'C25 A');
  const other = await registerAndLogin('c25_other', 'C25 Other');
  const { trip: tripA } = await createTrip(a.token);
  const { trip: tripOther } = await createTrip(other.token);

  await confirmStage(a.token, tripA.id, 'expenses_complete');
  await finalizeSettlement(a.token, tripA.id);
  await confirmStage(a.token, tripA.id, 'final_settlement');

  const statusA = await getClosureStatus(a.token, tripA.id);
  assert.equal(statusA.data.status, 'closed');

  const statusOther = await getClosureStatus(other.token, tripOther.id);
  assert.equal(statusOther.data.status, 'active');
  assert.equal(statusOther.data.settlementFinalized, false);

  const otherFinal = await getFinalSettlement(other.token, tripOther.id);
  assert.equal(otherFinal.status, 404);
});

test('C26. Unauthenticated closure status request is rejected with 401', async () => {
  const a = await registerAndLogin('c26_a', 'C26 A');
  const { trip } = await createTrip(a.token);

  const res = await fetch(`${baseUrl}/api/trips/${trip.id}/closure`);
  assert.equal(res.status, 401);
});

// ---------------------------------------------------------------------------
// REGRESSION: PHASE 7 LIVE PREVIEW BEHAVIOR IS UNCHANGED BY FINALIZATION
// ---------------------------------------------------------------------------

test('C27. Regression: the live settlement preview endpoint still works exactly as in Phase 7, independent of finalization', async () => {
  const a = await registerAndLogin('c27_a', 'C27 A');
  const b = await registerAndLogin('c27_b', 'C27 B');
  const { trip, membership: aM } = await createTrip(a.token);
  const { membership: bM } = await joinTrip(b.token, trip.join_code);

  await createExpense(a.token, trip.id, {
    amountMinor: 10000,
    participantSettlementUnitIds: [aM.settlement_unit_id, bM.settlement_unit_id],
  });

  const preview = await getSettlement(a.token, trip.id);
  assert.equal(preview.status, 200);
  assert.equal(preview.data.totalVerifiedExpensesMinor, 10000);
  assert.equal(preview.data.transactions.length, 1);
  assert.equal(preview.data.transactions[0].amountMinor, 5000);

  // Preview endpoint still has NOT written anything to settlements/
  // settlement_transactions - confirms Phase 7's "read-only, never writes"
  // guarantee still holds after Phase 8 was added alongside it.
  const settlementRows = await pool.query('SELECT COUNT(*)::int AS count FROM settlements WHERE trip_id = $1', [
    trip.id,
  ]);
  assert.equal(settlementRows.rows[0].count, 0);
});

test('C28. Regression: settlement preview remains available (and unaffected in shape) after the trip is closed', async () => {
  const a = await registerAndLogin('c28_a', 'C28 A');
  const { trip } = await createTrip(a.token);

  await confirmStage(a.token, trip.id, 'expenses_complete');
  await finalizeSettlement(a.token, trip.id);
  await confirmStage(a.token, trip.id, 'final_settlement');

  const preview = await getSettlement(a.token, trip.id);
  assert.equal(preview.status, 200);
  assert.ok(Array.isArray(preview.data.balances));
  assert.ok(Array.isArray(preview.data.transactions));
});
