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

const EMAIL_PREFIX = 'budget_test_';
const PASSWORD = 'Password123!';

async function cleanupTestData() {
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
      name: 'Budget Test Trip',
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

async function addExpense(token, tripId, amountMinor) {
  const res = await fetch(`${baseUrl}/api/trips/${tripId}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      amountMinor,
      description: 'Test expense',
      occurredAt: '2026-08-02T13:15:00.000Z',
    }),
  });
  return (await res.json()).expense;
}

async function getBudget(token, tripId) {
  const res = await fetch(`${baseUrl}/api/trips/${tripId}/budget`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.json() };
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

test('zero verified expenses -> 0% used', async () => {
  const owner = await registerAndLogin('zero', 'Zero Owner');
  const { trip } = await createTrip(owner.token, {
    budgetType: 'fixed_total',
    budgetAmountMinor: 1000000,
    verificationMode: 'automatic',
  });

  const { status, body } = await getBudget(owner.token, trip.id);
  assert.equal(status, 200);
  assert.equal(body.totalVerifiedMinor, 0);
  assert.equal(body.percentageUsed, 0);
  assert.equal(body.status, 'green');
});

test('budgetType "unlimited" returns only the running total, no limit fields', async () => {
  const owner = await registerAndLogin('unlimited_type', 'Unlimited Owner');
  const { trip } = await createTrip(owner.token, { budgetType: 'unlimited', verificationMode: 'automatic' });
  await addExpense(owner.token, trip.id, 500000);

  const { status, body } = await getBudget(owner.token, trip.id);
  assert.equal(status, 200);
  assert.equal(body.budgetType, 'unlimited');
  assert.equal(body.totalVerifiedMinor, 500000);
  assert.equal('budgetAmountMinor' in body, false);
  assert.equal('percentageUsed' in body, false);
  assert.equal('status' in body, false);
});

test('only verified expenses count - pending expenses are excluded from the total', async () => {
  const owner = await registerAndLogin('pending_excl', 'Pending Owner');
  const { trip } = await createTrip(owner.token, {
    budgetType: 'fixed_total',
    budgetAmountMinor: 1000000,
    verificationMode: 'member_approval', // new expenses start pending
  });

  await addExpense(owner.token, trip.id, 900000);

  const { body } = await getBudget(owner.token, trip.id);
  assert.equal(body.totalVerifiedMinor, 0, 'pending expense must not count toward the verified total');
  assert.equal(body.status, 'green');
});

test('fixed_total: multiple verified expenses sum correctly and cross the yellow threshold', async () => {
  const owner = await registerAndLogin('multi', 'Multi Owner');
  const { trip } = await createTrip(owner.token, {
    budgetType: 'fixed_total',
    budgetAmountMinor: 1000000, // 10,000 INR
    verificationMode: 'automatic',
  });

  await addExpense(owner.token, trip.id, 300000);
  await addExpense(owner.token, trip.id, 400000);

  const { body } = await getBudget(owner.token, trip.id);
  assert.equal(body.totalVerifiedMinor, 700000);
  assert.equal(body.percentageUsed, 70);
  assert.equal(body.status, 'yellow');
});

test('fixed_total: red threshold when spending meets or exceeds the budget', async () => {
  const owner = await registerAndLogin('red', 'Red Owner');
  const { trip } = await createTrip(owner.token, {
    budgetType: 'fixed_total',
    budgetAmountMinor: 500000,
    verificationMode: 'automatic',
  });

  await addExpense(owner.token, trip.id, 600000);

  const { body } = await getBudget(owner.token, trip.id);
  assert.equal(body.status, 'red');
  assert.ok(body.percentageUsed > 100);
});

test('fixed_per_person: budget limit reflects current member count dynamically', async () => {
  const owner = await registerAndLogin('perperson', 'Per Person Owner');
  const { trip } = await createTrip(owner.token, {
    budgetType: 'fixed_per_person',
    budgetAmountMinor: 500000, // 5,000 INR per person
    verificationMode: 'automatic',
  });

  // Just the owner (1 member): limit = 500000
  await addExpense(owner.token, trip.id, 400000);
  const oneMember = await getBudget(owner.token, trip.id);
  assert.equal(oneMember.body.budgetAmountMinor, 500000);
  assert.equal(oneMember.body.status, 'yellow'); // 400000/500000 = 80%

  // A second member joins -> limit should double to 1,000,000
  const second = await registerAndLogin('perperson_member2', 'Second Member');
  await joinTrip(second.token, trip.join_code);

  const twoMembers = await getBudget(owner.token, trip.id);
  assert.equal(twoMembers.body.budgetAmountMinor, 1000000, 'limit should recalculate as members join');
  // same 400000 spent, but limit doubled -> 40%, green
  assert.equal(twoMembers.body.status, 'green');
});

test('GET budget requires trip membership (404 for non-member)', async () => {
  const owner = await registerAndLogin('membercheck', 'Member Check Owner');
  const { trip } = await createTrip(owner.token, { budgetType: 'unlimited', verificationMode: 'automatic' });

  const outsider = await registerAndLogin('membercheck_outsider', 'Outsider');
  const res = await fetch(`${baseUrl}/api/trips/${trip.id}/budget`, {
    headers: { Authorization: `Bearer ${outsider.token}` },
  });
  assert.equal(res.status, 404);
});

test('GET budget requires authentication (401)', async () => {
  const owner = await registerAndLogin('authcheck', 'Auth Check Owner');
  const { trip } = await createTrip(owner.token, { budgetType: 'unlimited', verificationMode: 'automatic' });

  const res = await fetch(`${baseUrl}/api/trips/${trip.id}/budget`);
  assert.equal(res.status, 401);
});
