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
import { errorHandler } from '../../src/middleware/errorHandler.js';
import jwt from 'jsonwebtoken';

let server;
let baseUrl;

const PASSWORD = 'Password123!';
const EMAIL_PREFIX = 'delete_unit_test_';

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
      name: 'Delete Unit Test Trip',
      budgetType: 'unlimited',
      fairShareMethod: 'equal_per_unit',
      verificationMode: 'automatic',
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
  return res.json();
}

async function moveIntoUnit(token, tripId, settlementUnitId) {
  const res = await fetch(`${baseUrl}/api/trips/${tripId}/members/me/settlement-unit`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ settlementUnitId }),
  });
  const data = await res.json();
  if (res.status === 200 && data.transferRequest) {
    const ownerRes = await pool.query(
      `SELECT user_id FROM trip_members WHERE trip_id = $1 AND role = 'owner'`,
      [tripId]
    );
    const ownerUserId = ownerRes.rows[0]?.user_id;
    const decodedToken = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    const userId = decodedToken.sub || decodedToken.id;

    if (ownerUserId && ownerUserId !== userId) {
      const ownerToken = jwt.sign({ sub: ownerUserId }, process.env.JWT_SECRET || 'tripledger_super_secret_key_2026_change_this_later');
      await fetch(`${baseUrl}/api/trips/${tripId}/transfer-requests/${data.transferRequest.id}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
    } else {
      await pool.query(
        `UPDATE settlement_transfer_requests SET status = 'approved', reviewed_at = NOW() WHERE id = $1`,
        [data.transferRequest.id]
      );
      await pool.query(
        `UPDATE trip_members SET settlement_unit_id = $1 WHERE trip_id = $2 AND user_id = $3`,
        [settlementUnitId, tripId, userId]
      );
    }
  }
  const membership = { settlement_unit_id: settlementUnitId };
  return { status: res.status, data: { ...data, membership }, membership };
}

async function createExpense(token, tripId, expenseOverrides = {}) {
  const res = await fetch(`${baseUrl}/api/trips/${tripId}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      amountMinor: 10000,
      description: 'Test expense',
      category: 'food',
      occurredAt: '2026-08-09T18:00:00.000Z',
      ...expenseOverrides,
    }),
  });
  return { status: res.status, data: await res.json() };
}

async function deleteUnit(token, tripId, unitId) {
  const res = await fetch(`${baseUrl}/api/trips/${tripId}/settlement-units/${unitId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, data: await res.json() };
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
  app.use('/api/trips/:tripId/settlement', settlementRoutes);
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

test('DELETE settlement-units/:unitId requires authentication (401)', async () => {
  const owner = await registerAndLogin('unauth_owner', 'Owner');
  const { trip } = await createTrip(owner.token);
  const { settlementUnit: unit } = await createGroupUnit(owner.token, trip.id, 'Fam Unused');

  const res = await fetch(`${baseUrl}/api/trips/${trip.id}/settlement-units/${unit.id}`, {
    method: 'DELETE',
  });

  assert.equal(res.status, 401);
});

test('DELETE settlement-units/:unitId rejects a non-owner (403 FORBIDDEN)', async () => {
  const owner = await registerAndLogin('nonowner_owner', 'Owner');
  const { trip } = await createTrip(owner.token);
  const { settlementUnit: unit } = await createGroupUnit(owner.token, trip.id, 'Fam Unused');

  const member = await registerAndLogin('nonowner_member', 'Member');
  await joinTrip(member.token, trip.join_code);

  const { status, data } = await deleteUnit(member.token, trip.id, unit.id);
  assert.equal(status, 403);
  assert.equal(data.error.code, 'FORBIDDEN');
});

test('DELETE settlement-units/:unitId hard-deletes an empty, never-used group unit for the owner', async () => {
  const owner = await registerAndLogin('empty_owner', 'Owner');
  const { trip } = await createTrip(owner.token);
  const { settlementUnit: unit } = await createGroupUnit(owner.token, trip.id, 'Fam Unused');

  const { status, data } = await deleteUnit(owner.token, trip.id, unit.id);
  assert.equal(status, 200);
  assert.equal(data.archived, false, 'a never-used unit should be hard-deleted, not archived');

  const row = await pool.query('SELECT id FROM settlement_units WHERE id = $1', [unit.id]);
  assert.equal(row.rows.length, 0, 'the row should be genuinely gone, not just archived');
});

test('DELETE settlement-units/:unitId rejects a group that still has active members (409)', async () => {
  const owner = await registerAndLogin('active_owner', 'Owner');
  const { trip } = await createTrip(owner.token);
  const { settlementUnit: unit } = await createGroupUnit(owner.token, trip.id, 'Fam Active');
  await moveIntoUnit(owner.token, trip.id, unit.id);

  const { status, data } = await deleteUnit(owner.token, trip.id, unit.id);
  assert.equal(status, 409);
  assert.equal(data.error.code, 'SETTLEMENT_UNIT_HAS_MEMBERS');

  const row = await pool.query('SELECT id FROM settlement_units WHERE id = $1', [unit.id]);
  assert.equal(row.rows.length, 1, 'a unit with active members must survive a rejected delete');
});

test('DELETE settlement-units/:unitId archives (does not hard-delete) a unit with historical expense references', async () => {
  const owner = await registerAndLogin('historical_owner', 'Owner');
  const { trip, membership: ownerM } = await createTrip(owner.token);
  const { settlementUnit: unit } = await createGroupUnit(owner.token, trip.id, 'Fam Historical');

  await moveIntoUnit(owner.token, trip.id, unit.id);
  const { status: expenseStatus } = await createExpense(owner.token, trip.id, {
    amountMinor: 5000,
    participantSettlementUnitIds: [unit.id],
  });
  assert.equal(expenseStatus, 201);

  // Move back out - not into an individual unit (that's not a valid move
  // target), but into a second, fresh group unit - leaving Fam Historical
  // with 0 active members while its historical expense reference remains.
  const { settlementUnit: parkingUnit } = await createGroupUnit(owner.token, trip.id, 'Parking Unit');
  await moveIntoUnit(owner.token, trip.id, parkingUnit.id);

  const { status, data } = await deleteUnit(owner.token, trip.id, unit.id);
  assert.equal(status, 200);
  assert.equal(data.archived, true, 'a historically-referenced unit must be archived, not hard-deleted');
  assert.ok(data.settlementUnit.archived_at, 'the returned row should reflect the archived_at timestamp');

  // The row itself must still exist - hard-deleting it would violate the
  // expense's payer_settlement_unit_id / expense_participants references.
  const row = await pool.query('SELECT id, archived_at FROM settlement_units WHERE id = $1', [unit.id]);
  assert.equal(row.rows.length, 1, 'an archived unit\u2019s row must be preserved for historical integrity');
  assert.ok(row.rows[0].archived_at);

  // The settlement calculation must still resolve its name/balance
  // correctly (Batch 1 historical payer/unit integrity, untouched).
  const settlementRes = await fetch(`${baseUrl}/api/trips/${trip.id}/settlement`, {
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  const settlementData = await settlementRes.json();
  const historicalBalance = settlementData.balances.find((b) => b.settlementUnitId === unit.id);
  assert.ok(historicalBalance, 'the archived-but-historically-relevant unit must still appear in balances');
  assert.equal(historicalBalance.name, 'Fam Historical');
  assert.equal(historicalBalance.totalPaidMinor, 5000);
});

test('DELETE settlement-units/:unitId refuses to delete an individual settlement unit (400)', async () => {
  const owner = await registerAndLogin('individual_owner', 'Owner');
  const { trip, membership: ownerM } = await createTrip(owner.token);

  // The owner's own auto-created individual unit currently has 0 active
  // members once they move into a group - proving the block is on
  // "kind === individual", not merely on active-member count.
  const { settlementUnit: groupUnit } = await createGroupUnit(owner.token, trip.id, 'Some Group');
  await moveIntoUnit(owner.token, trip.id, groupUnit.id);

  const { status, data } = await deleteUnit(owner.token, trip.id, ownerM.settlement_unit_id);
  assert.equal(status, 400);
  assert.equal(data.error.code, 'CANNOT_DELETE_INDIVIDUAL_UNIT');

  const row = await pool.query('SELECT id FROM settlement_units WHERE id = $1', [ownerM.settlement_unit_id]);
  assert.equal(row.rows.length, 1);
});

test('DELETE settlement-units/:unitId returns 404 for a unit that does not belong to the trip', async () => {
  const ownerA = await registerAndLogin('cross_owner_a', 'Owner A');
  const { trip: tripA } = await createTrip(ownerA.token);

  const ownerB = await registerAndLogin('cross_owner_b', 'Owner B');
  const { trip: tripB } = await createTrip(ownerB.token);
  const { settlementUnit: unitInB } = await createGroupUnit(ownerB.token, tripB.id, 'Fam In B');

  const { status, data } = await deleteUnit(ownerA.token, tripA.id, unitInB.id);
  assert.equal(status, 404);
  assert.equal(data.error.code, 'SETTLEMENT_UNIT_NOT_FOUND');
});
