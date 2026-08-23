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
import { errorHandler } from '../../src/middleware/errorHandler.js';

let server;
let baseUrl;

const PASSWORD = 'Password123!';
const EMAIL_PREFIX = 'delete_trip_test_';

// Same explicit-cascade rationale as expenses.test.js's cleanupTestData:
// don't rely on a single top-level DELETE FROM trips resolving every
// cross-reference in the right order on its own.
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

async function createTrip(token) {
  const res = await fetch(`${baseUrl}/api/trips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: 'Delete Me Trip',
      currency: 'INR',
      budgetType: 'unlimited',
      fairShareMethod: 'equal_per_unit',
      verificationMode: 'automatic',
    }),
  });
  const data = await res.json();
  return { trip: data.trip, membership: data.membership };
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

test('DELETE /api/trips/:tripId requires authentication (401)', async () => {
  const owner = await registerAndLogin('unauth_owner', 'Owner');
  const { trip } = await createTrip(owner.token);

  const res = await fetch(`${baseUrl}/api/trips/${trip.id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  });

  assert.equal(res.status, 401);
});

test('DELETE /api/trips/:tripId rejects a non-owner member (403 FORBIDDEN)', async () => {
  const owner = await registerAndLogin('nonowner_owner', 'Owner');
  const { trip } = await createTrip(owner.token);

  const member = await registerAndLogin('nonowner_member', 'Member');
  const joinRes = await fetch(`${baseUrl}/api/trips/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.token}` },
    body: JSON.stringify({ joinCode: trip.join_code }),
  });
  assert.equal(joinRes.status, 200);

  const res = await fetch(`${baseUrl}/api/trips/${trip.id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.token}` },
    body: JSON.stringify({ password: PASSWORD }),
  });

  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.error.code, 'FORBIDDEN');

  // Confirm the trip genuinely survives a rejected non-owner attempt.
  const getRes = await fetch(`${baseUrl}/api/trips/${trip.id}`, {
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  assert.equal(getRes.status, 200);
});

test('DELETE /api/trips/:tripId rejects the owner with the wrong password (401 INVALID_CREDENTIALS)', async () => {
  const owner = await registerAndLogin('wrongpw_owner', 'Owner');
  const { trip } = await createTrip(owner.token);

  const res = await fetch(`${baseUrl}/api/trips/${trip.id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ password: 'DefinitelyWrongPassword!' }),
  });

  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.error.code, 'INVALID_CREDENTIALS');

  // Confirm the trip genuinely survives a rejected wrong-password attempt.
  const getRes = await fetch(`${baseUrl}/api/trips/${trip.id}`, {
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  assert.equal(getRes.status, 200);
});

test('DELETE /api/trips/:tripId rejects a missing password (422 VALIDATION_ERROR)', async () => {
  const owner = await registerAndLogin('missingpw_owner', 'Owner');
  const { trip } = await createTrip(owner.token);

  const res = await fetch(`${baseUrl}/api/trips/${trip.id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({}),
  });

  assert.equal(res.status, 422);
  const data = await res.json();
  assert.equal(data.error.code, 'VALIDATION_ERROR');
});

test('DELETE /api/trips/:tripId succeeds for the owner with the correct password, and permanently removes all related data', async () => {
  const owner = await registerAndLogin('success_owner', 'Owner');
  const { trip } = await createTrip(owner.token);

  const member = await registerAndLogin('success_member', 'Member');
  const joinRes = await fetch(`${baseUrl}/api/trips/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.token}` },
    body: JSON.stringify({ joinCode: trip.join_code }),
  });
  assert.equal(joinRes.status, 200);

  // Give the trip some real related data - an expense (which, in
  // 'automatic' mode, is immediately verified) - so this test proves
  // actual cleanup, not just an empty trip's row disappearing.
  const expenseRes = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({
      amountMinor: 150000,
      description: 'Cab to the airport',
      category: 'transport',
      occurredAt: '2026-08-02T09:00:00.000Z',
    }),
  });
  assert.equal(expenseRes.status, 201);
  const expense = (await expenseRes.json()).expense;

  const res = await fetch(`${baseUrl}/api/trips/${trip.id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ password: PASSWORD }),
  });

  assert.equal(res.status, 204);

  // Trip itself is gone - not merely archived/hidden.
  const tripRow = await pool.query('SELECT id FROM trips WHERE id = $1', [trip.id]);
  assert.equal(tripRow.rows.length, 0);

  // Every related table is genuinely cleaned up, not left orphaned.
  const membersRow = await pool.query('SELECT id FROM trip_members WHERE trip_id = $1', [trip.id]);
  assert.equal(membersRow.rows.length, 0, 'trip_members should be fully removed');

  const unitsRow = await pool.query('SELECT id FROM settlement_units WHERE trip_id = $1', [trip.id]);
  assert.equal(unitsRow.rows.length, 0, 'settlement_units should be fully removed');

  const expensesRow = await pool.query('SELECT id FROM expenses WHERE trip_id = $1', [trip.id]);
  assert.equal(expensesRow.rows.length, 0, 'expenses should be fully removed');

  const participantsRow = await pool.query(
    'SELECT expense_id FROM expense_participants WHERE expense_id = $1',
    [expense.id]
  );
  assert.equal(participantsRow.rows.length, 0, 'expense_participants should be fully removed');

  // A deleted trip cannot subsequently be accessed by anyone who used to
  // be a member - same 404 TRIP_NOT_FOUND a non-member would get, not a
  // 500 from a dangling reference.
  const getAsOwner = await fetch(`${baseUrl}/api/trips/${trip.id}`, {
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  assert.equal(getAsOwner.status, 404);
  assert.equal((await getAsOwner.json()).error.code, 'TRIP_NOT_FOUND');

  const getAsMember = await fetch(`${baseUrl}/api/trips/${trip.id}`, {
    headers: { Authorization: `Bearer ${member.token}` },
  });
  assert.equal(getAsMember.status, 404);

  // The former member's own trip list no longer includes it either.
  const listRes = await fetch(`${baseUrl}/api/trips`, {
    headers: { Authorization: `Bearer ${member.token}` },
  });
  const listData = await listRes.json();
  assert.ok(!listData.trips.some((t) => t.id === trip.id));
});
