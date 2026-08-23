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
import budgetRoutes from '../../src/routes/budgetRoutes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

let server;
let baseUrl;

const PASSWORD = 'Password123!';
const EMAIL_PREFIX = 'expenses_test_';

async function cleanupTestData() {
  // expense_participants.settlement_unit_id has NO cascade to settlement_units
  // (by original Phase 1 design - a settlement unit shouldn't be silently
  // removable while expenses still reference it). A single "DELETE FROM
  // trips" relies on Postgres's internal cascade ordering across two
  // independent paths (trips->settlement_units and trips->expenses->
  // expense_participants), which isn't guaranteed, so we delete explicitly
  // in dependency order instead of relying on cascade alone.
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
    `DELETE FROM expenses WHERE trip_id IN (
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

async function createTrip(token, overrides = {}) {
  const res = await fetch(`${baseUrl}/api/trips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: 'Expense Test Trip',
      budgetType: 'unlimited',
      fairShareMethod: 'equal_per_unit',
      verificationMode: 'automatic',
      ...overrides,
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

before(async () => {
  await cleanupTestData();

  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/trips', tripRoutes);
  app.use('/api/trips/:tripId/expenses', expenseRoutes);
  app.use('/api/trips/:tripId/budget', budgetRoutes);
  app.use(errorHandler);

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  await cleanupTestData();
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

const validExpenseBody = {
  amountMinor: 200000,
  description: 'Lunch at the beach shack',
  category: 'food',
  occurredAt: '2026-08-02T13:15:00.000Z',
};

// ---- Setup: two trips with different verification modes ----

let autoOwnerToken, autoOwnerMember, autoTrip;
let approvalOwnerToken, approvalTrip;
let outsiderToken;

test('setup: create users and trips for expense tests', async () => {
  const owner = await registerAndLogin('auto_owner', 'Auto Owner');
  autoOwnerToken = owner.token;

  const { trip, membership } = await createTrip(autoOwnerToken, { verificationMode: 'automatic' });
  autoTrip = trip;
  autoOwnerMember = membership;

  const approvalOwner = await registerAndLogin('approval_owner', 'Approval Owner');
  approvalOwnerToken = approvalOwner.token;
  const { trip: aTrip } = await createTrip(approvalOwnerToken, { verificationMode: 'member_approval' });
  approvalTrip = aTrip;

  const outsider = await registerAndLogin('outsider', 'Outsider');
  outsiderToken = outsider.token;

  assert.ok(autoTrip.id && approvalTrip.id);
});

test('POST expenses requires authentication (401)', async () => {
  const res = await fetch(`${baseUrl}/api/trips/${autoTrip.id}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validExpenseBody),
  });
  assert.equal(res.status, 401);
});

test('POST expenses rejects a non-member (404, non-leaking)', async () => {
  const res = await fetch(`${baseUrl}/api/trips/${autoTrip.id}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${outsiderToken}` },
    body: JSON.stringify(validExpenseBody),
  });
  assert.equal(res.status, 404);
});

let autoExpense;

test('automatic verification mode: created expense is immediately "verified"', async () => {
  const res = await fetch(`${baseUrl}/api/trips/${autoTrip.id}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${autoOwnerToken}` },
    body: JSON.stringify(validExpenseBody),
  });
  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.expense.status, 'verified');
  assert.equal(data.expense.amount_minor, '200000');
  assert.equal(data.expense.paid_by_member_id, autoOwnerMember.id, 'payer must be the authenticated caller');
  autoExpense = data.expense;
});

test('member_approval mode: created expense starts "pending"', async () => {
  const res = await fetch(`${baseUrl}/api/trips/${approvalTrip.id}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${approvalOwnerToken}` },
    body: JSON.stringify(validExpenseBody),
  });
  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.expense.status, 'pending');
});

test('tiered mode: created expense starts "pending"', async () => {
  const tieredOwner = await registerAndLogin('tiered_owner', 'Tiered Owner');
  const { trip } = await createTrip(tieredOwner.token, { verificationMode: 'tiered' });

  const res = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tieredOwner.token}` },
    body: JSON.stringify(validExpenseBody),
  });
  const data = await res.json();
  assert.equal(data.expense.status, 'pending');
});

test('the client cannot set paidByMemberId - payer is always the authenticated caller', async () => {
  const res = await fetch(`${baseUrl}/api/trips/${autoTrip.id}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${autoOwnerToken}` },
    body: JSON.stringify({ ...validExpenseBody, paidByMemberId: 'some-other-member-id', paid_by_member_id: 'x' }),
  });
  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.expense.paid_by_member_id, autoOwnerMember.id);
});

test('the client cannot force status via the request body', async () => {
  const res = await fetch(`${baseUrl}/api/trips/${approvalTrip.id}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${approvalOwnerToken}` },
    body: JSON.stringify({ ...validExpenseBody, status: 'verified' }),
  });
  const data = await res.json();
  assert.equal(data.expense.status, 'pending', 'status must be server-determined, not client-supplied');
});

test('participantSettlementUnitIds defaults to every current unit in the trip when omitted', async () => {
  const res = await fetch(`${baseUrl}/api/trips/${autoTrip.id}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${autoOwnerToken}` },
    body: JSON.stringify(validExpenseBody),
  });
  const data = await res.json();
  assert.equal(data.participants.length, 1, 'only one unit exists in this trip so far (the owner)');
});

test('cross-trip participant injection is rejected (404 SETTLEMENT_UNIT_NOT_FOUND)', async () => {
  // approvalTrip's settlement unit does not belong to autoTrip
  const approvalTripDetail = await (
    await fetch(`${baseUrl}/api/trips/${approvalTrip.id}`, { headers: { Authorization: `Bearer ${approvalOwnerToken}` } })
  ).json();
  const foreignUnitId = approvalTripDetail.settlementUnits[0].id;

  const res = await fetch(`${baseUrl}/api/trips/${autoTrip.id}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${autoOwnerToken}` },
    body: JSON.stringify({ ...validExpenseBody, participantSettlementUnitIds: [foreignUnitId] }),
  });
  assert.equal(res.status, 404);
  const data = await res.json();
  assert.equal(data.error.code, 'SETTLEMENT_UNIT_NOT_FOUND');
});

test('GET single expense returns full detail', async () => {
  const res = await fetch(`${baseUrl}/api/trips/${autoTrip.id}/expenses/${autoExpense.id}`, {
    headers: { Authorization: `Bearer ${autoOwnerToken}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.expense.id, autoExpense.id);
  assert.ok(Array.isArray(data.participants));
});

test('GET expense from a different trip ID returns 404 (not leaked cross-trip)', async () => {
  const res = await fetch(`${baseUrl}/api/trips/${approvalTrip.id}/expenses/${autoExpense.id}`, {
    headers: { Authorization: `Bearer ${approvalOwnerToken}` },
  });
  assert.equal(res.status, 404);
});

test('GET expenses list returns all expenses for the trip', async () => {
  const res = await fetch(`${baseUrl}/api/trips/${autoTrip.id}/expenses`, {
    headers: { Authorization: `Bearer ${autoOwnerToken}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.expenses.length >= 2);
});

test('GET expenses list supports ?status= filtering', async () => {
  const res = await fetch(`${baseUrl}/api/trips/${approvalTrip.id}/expenses?status=pending`, {
    headers: { Authorization: `Bearer ${approvalOwnerToken}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.expenses.every((e) => e.status === 'pending'));
});

test('GET expenses list rejects an invalid status filter (422)', async () => {
  const res = await fetch(`${baseUrl}/api/trips/${autoTrip.id}/expenses?status=not_a_real_status`, {
    headers: { Authorization: `Bearer ${autoOwnerToken}` },
  });
  assert.equal(res.status, 422);
});

// ---- Editing ----

let pendingExpenseForEdit;
let secondMemberToken;

test('setup: add a second member to the member_approval trip for ownership tests', async () => {
  const second = await registerAndLogin('approval_member2', 'Second Member');
  secondMemberToken = second.token;
  await joinTrip(secondMemberToken, approvalTrip.join_code);

  const res = await fetch(`${baseUrl}/api/trips/${approvalTrip.id}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${approvalOwnerToken}` },
    body: JSON.stringify(validExpenseBody),
  });
  pendingExpenseForEdit = (await res.json()).expense;
  assert.equal(pendingExpenseForEdit.status, 'pending');
});

test('the payer can edit their own pending expense', async () => {
  const res = await fetch(`${baseUrl}/api/trips/${approvalTrip.id}/expenses/${pendingExpenseForEdit.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${approvalOwnerToken}` },
    body: JSON.stringify({ description: 'Updated description', amountMinor: 300000 }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.expense.description, 'Updated description');
  assert.equal(data.expense.amount_minor, '300000');
});

test('a non-payer member cannot edit someone else\'s expense (403 NOT_EXPENSE_OWNER)', async () => {
  const res = await fetch(`${baseUrl}/api/trips/${approvalTrip.id}/expenses/${pendingExpenseForEdit.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secondMemberToken}` },
    body: JSON.stringify({ description: 'Malicious edit attempt' }),
  });
  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.error.code, 'NOT_EXPENSE_OWNER');
});

test('a verified expense cannot be edited (409 EXPENSE_NOT_EDITABLE)', async () => {
  const res = await fetch(`${baseUrl}/api/trips/${autoTrip.id}/expenses/${autoExpense.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${autoOwnerToken}` },
    body: JSON.stringify({ description: 'Trying to edit a verified expense' }),
  });
  assert.equal(res.status, 409);
  const data = await res.json();
  assert.equal(data.error.code, 'EXPENSE_NOT_EDITABLE');
});

test('editing participantSettlementUnitIds replaces the participant set', async () => {
  const tripDetail = await (
    await fetch(`${baseUrl}/api/trips/${approvalTrip.id}`, { headers: { Authorization: `Bearer ${approvalOwnerToken}` } })
  ).json();
  const singleUnitId = tripDetail.settlementUnits[0].id;

  const res = await fetch(`${baseUrl}/api/trips/${approvalTrip.id}/expenses/${pendingExpenseForEdit.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${approvalOwnerToken}` },
    body: JSON.stringify({ participantSettlementUnitIds: [singleUnitId] }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.participants.length, 1);
  assert.equal(data.participants[0].settlement_unit_id, singleUnitId);
});

test('invalid amountMinor is rejected (422)', async () => {
  const res = await fetch(`${baseUrl}/api/trips/${autoTrip.id}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${autoOwnerToken}` },
    body: JSON.stringify({ ...validExpenseBody, amountMinor: -500 }),
  });
  assert.equal(res.status, 422);
});

test('invalid (empty) description is rejected (422)', async () => {
  const res = await fetch(`${baseUrl}/api/trips/${autoTrip.id}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${autoOwnerToken}` },
    body: JSON.stringify({ ...validExpenseBody, description: '' }),
  });
  assert.equal(res.status, 422);
});

test('invalid occurredAt datetime is rejected (422)', async () => {
  const res = await fetch(`${baseUrl}/api/trips/${autoTrip.id}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${autoOwnerToken}` },
    body: JSON.stringify({ ...validExpenseBody, occurredAt: 'not-a-date' }),
  });
  assert.equal(res.status, 422);
});

test('decimal amountMinor is rejected (422) - money must stay integer', async () => {
  const res = await fetch(`${baseUrl}/api/trips/${autoTrip.id}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${autoOwnerToken}` },
    body: JSON.stringify({ ...validExpenseBody, amountMinor: 2000.5 }),
  });
  assert.equal(res.status, 422);
});
