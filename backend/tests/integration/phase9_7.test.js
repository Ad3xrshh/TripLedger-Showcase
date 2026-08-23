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
import approvalRuleRoutes from '../../src/routes/approvalRuleRoutes.js';
import settlementRoutes from '../../src/routes/settlementRoutes.js';
import closureRoutes from '../../src/routes/closureRoutes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

// Phase 9.7: regression coverage for the closed-trip mutation guards added
// to ExpenseService.createExpense/updateExpense and
// ExpenseApprovalService.approveExpense/rejectExpense/createApprovalRule.
//
// The full ACTIVE -> CLOSING -> CLOSED lifecycle itself (confirmations,
// finalize, idempotency, authorization, cross-trip isolation) is already
// covered by tests/integration/phase8.test.js (C1-C28) and is NOT
// duplicated here. This file only proves the one thing that was genuinely
// missing: once a trip reaches 'closed', the mutation endpoints that were
// previously silent about trip status now reject with 409
// TRIP_ALREADY_CLOSED - the same code/shape SettlementService and
// TripClosureService already use for the same condition.

let server;
let baseUrl;

const PASSWORD = 'Password123!';
const EMAIL_PREFIX = 'phase9_7_test_';

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
    `DELETE FROM approval_rules WHERE trip_id IN (
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
      name: 'Phase 9.7 Test Trip',
      budgetType: 'unlimited',
      fairShareMethod: 'equal_per_unit',
      verificationMode: 'member_approval',
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
      amountMinor: 5000,
      description: 'Test expense',
      category: 'Food',
      occurredAt: '2026-08-09T18:00:00.000Z',
      ...expenseOverrides,
    }),
  });
  return { status: res.status, data: await res.json() };
}

async function updateExpense(token, tripId, expenseId, updates) {
  const res = await fetch(`${baseUrl}/api/trips/${tripId}/expenses/${expenseId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(updates),
  });
  return { status: res.status, data: await res.json() };
}

async function approveExpense(token, tripId, expenseId) {
  const res = await fetch(`${baseUrl}/api/trips/${tripId}/expenses/${expenseId}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, data: await res.json() };
}

async function rejectExpense(token, tripId, expenseId, reason) {
  const res = await fetch(`${baseUrl}/api/trips/${tripId}/expenses/${expenseId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(reason ? { reason } : {}),
  });
  return { status: res.status, data: await res.json() };
}

async function createApprovalRule(token, tripId, ruleOverrides = {}) {
  const res = await fetch(`${baseUrl}/api/trips/${tripId}/approval-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      minAmountMinor: 0,
      maxAmountMinor: null,
      requiredApprovals: 1,
      ...ruleOverrides,
    }),
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
  app.use('/api/trips/:tripId/approval-rules', approvalRuleRoutes);
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

// Builds a two-member, member_approval-mode trip with one expense left
// deliberately unapproved (still 'pending'), then drives it all the way to
// 'closed' via the existing Phase 8 closure/settlement endpoints. Returns
// everything a guard test needs to act against the now-closed trip.
//
// Leaving the expense pending (rather than approving it) is deliberate: it
// lets D3/D4 exercise the updateExpense/approveExpense/rejectExpense guards
// against a real expense row, and proves finalizeSettlement's
// 'expenses_complete' gate is independent of individual expense status -
// closure only cares whether every active member confirmed the stage, not
// whether every expense has finished its own approval workflow.
async function buildClosedTripWithPendingExpense(suffix) {
  const owner = await registerAndLogin(`owner_${suffix}`, 'Owner');
  const member = await registerAndLogin(`member_${suffix}`, 'Member');

  const { trip } = await createTrip(owner.token);
  await joinTrip(member.token, trip.join_code);

  const { status: createStatus, data: expenseData } = await createExpense(owner.token, trip.id);
  assert.equal(createStatus, 201, 'sanity: expense creation succeeds on an active trip');
  const expenseId = expenseData.expense.id;

  await confirmStage(owner.token, trip.id, 'expenses_complete');
  await confirmStage(member.token, trip.id, 'expenses_complete');

  const { status: finalizeStatus } = await finalizeSettlement(owner.token, trip.id);
  assert.equal(finalizeStatus, 200, 'sanity: finalize succeeds once both members confirmed expenses_complete');

  await confirmStage(owner.token, trip.id, 'final_settlement');
  const { data: closureAfterSecondConfirm } = await confirmStage(member.token, trip.id, 'final_settlement');
  assert.equal(closureAfterSecondConfirm.status, 'closed', 'sanity: trip is closed after both final_settlement confirmations');

  return { owner, member, trip, expenseId };
}

// ---------------------------------------------------------------------------
// D. CLOSED-TRIP MUTATION GUARDS (Phase 9.7)
// ---------------------------------------------------------------------------

test('D1. createExpense on a closed trip is rejected with 409 TRIP_ALREADY_CLOSED', async () => {
  const { owner, trip } = await buildClosedTripWithPendingExpense('d1');

  const { status, data } = await createExpense(owner.token, trip.id);

  assert.equal(status, 409);
  assert.equal(data.error.code, 'TRIP_ALREADY_CLOSED');
});

test('D2. updateExpense on a closed trip is rejected with 409 TRIP_ALREADY_CLOSED', async () => {
  const { owner, trip, expenseId } = await buildClosedTripWithPendingExpense('d2');

  const { status, data } = await updateExpense(owner.token, trip.id, expenseId, { amountMinor: 7500 });

  assert.equal(status, 409);
  assert.equal(data.error.code, 'TRIP_ALREADY_CLOSED');
});

test('D3. approveExpense on a closed trip is rejected with 409 TRIP_ALREADY_CLOSED', async () => {
  const { member, trip, expenseId } = await buildClosedTripWithPendingExpense('d3');

  const { status, data } = await approveExpense(member.token, trip.id, expenseId);

  assert.equal(status, 409);
  assert.equal(data.error.code, 'TRIP_ALREADY_CLOSED');
});

test('D4. rejectExpense on a closed trip is rejected with 409 TRIP_ALREADY_CLOSED', async () => {
  const { member, trip, expenseId } = await buildClosedTripWithPendingExpense('d4');

  const { status, data } = await rejectExpense(member.token, trip.id, expenseId, 'no longer valid');

  assert.equal(status, 409);
  assert.equal(data.error.code, 'TRIP_ALREADY_CLOSED');
});

test('D5. createApprovalRule on a closed trip is rejected with 409 TRIP_ALREADY_CLOSED', async () => {
  const { owner, trip } = await buildClosedTripWithPendingExpense('d5');

  const { status, data } = await createApprovalRule(owner.token, trip.id);

  assert.equal(status, 409);
  assert.equal(data.error.code, 'TRIP_ALREADY_CLOSED');
});

test('D6. Regression: the same guards do NOT fire on an active trip - normal expense/approval-rule flow is unaffected', async () => {
  const owner = await registerAndLogin('owner_d6', 'Owner');
  const member = await registerAndLogin('member_d6', 'Member');
  const member2 = await registerAndLogin('member2_d6', 'Member 2');

  const { trip } = await createTrip(owner.token);
  await joinTrip(member.token, trip.join_code);
  await joinTrip(member2.token, trip.join_code);

  const { status: createStatus, data: expenseData } = await createExpense(owner.token, trip.id);
  assert.equal(createStatus, 201);

  const { status: updateStatus } = await updateExpense(owner.token, trip.id, expenseData.expense.id, {
    amountMinor: 6000,
  });
  assert.equal(updateStatus, 200);

  const { status: approveStatus } = await approveExpense(member.token, trip.id, expenseData.expense.id);
  assert.equal(approveStatus, 200);

  const { status: ruleStatus } = await createApprovalRule(owner.token, trip.id, {
    minAmountMinor: 100000,
    maxAmountMinor: null,
    requiredApprovals: 2,
  });
  assert.equal(ruleStatus, 201);
});

test('D7. Regression: GET closure status and GET settlement/final remain readable after the trip is closed', async () => {
  const { owner, trip } = await buildClosedTripWithPendingExpense('d7');

  const { status: closureStatusCode, data: closureData } = await getClosureStatus(owner.token, trip.id);
  assert.equal(closureStatusCode, 200);
  assert.equal(closureData.status, 'closed');

  const res = await fetch(`${baseUrl}/api/trips/${trip.id}/settlement/final`, {
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  assert.equal(res.status, 200);
});
