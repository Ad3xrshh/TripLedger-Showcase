import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pool from '../../src/config/db.js';
import authRoutes from '../../src/routes/authRoutes.js';
import tripRoutes from '../../src/routes/tripRoutes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

let server;
let baseUrl;

const OWNER_EMAIL = 'trips_test_owner@example.com';
const MEMBER_EMAIL = 'trips_test_member@example.com';
const OUTSIDER_EMAIL = 'trips_test_outsider@example.com';
const PASSWORD = 'Password123!';

async function cleanupTestData() {
  // Trips cascade-delete their trip_members/settlement_units, so deleting
  // the users' trips first, then the users, leaves no orphaned rows.
  // Matches by LIKE pattern to also catch ad hoc users registered mid-test
  // (e.g. the second family member below), since trip_members has no
  // cascade from users by design (historical membership stays attributable
  // even if a user is later removed).
  await pool.query(
    `DELETE FROM trips WHERE created_by IN (
       SELECT id FROM users WHERE email LIKE 'trips_test_%@example.com'
     )`
  );
  await pool.query(`DELETE FROM users WHERE email LIKE 'trips_test_%@example.com'`);
}

async function registerAndLogin(email, displayName) {
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, displayName }),
  });
  const data = await res.json();
  return { token: data.token, user: data.user };
}

before(async () => {
  await cleanupTestData();

  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', async (req, res) => {
    try {
      const result = await pool.query('SELECT now()');
      res.json({ status: 'ok', dbTime: result.rows[0].now });
    } catch (err) {
      res.status(500).json({ status: 'error', message: 'Database connection failed' });
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/trips', tripRoutes);
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
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await pool.end();
});

const validTripBody = {
  name: 'Goa Trip 2026',
  startDate: '2026-08-01',
  endDate: '2026-08-05',
  currency: 'inr',
  budgetType: 'fixed_total',
  budgetAmountMinor: 6000000,
  fairShareMethod: 'equal_per_unit',
  verificationMode: 'member_approval',
};

let ownerToken, ownerUser, memberToken, memberUser, outsiderToken;
let createdTrip, createdMembership;

test('setup: register owner, member, and outsider users', async () => {
  ({ token: ownerToken, user: ownerUser } = await registerAndLogin(OWNER_EMAIL, 'Trip Owner'));
  ({ token: memberToken, user: memberUser } = await registerAndLogin(MEMBER_EMAIL, 'Trip Member'));
  ({ token: outsiderToken } = await registerAndLogin(OUTSIDER_EMAIL, 'Outsider'));
  assert.ok(ownerToken && memberToken && outsiderToken);
});

test('POST /api/trips creates a trip, an individual settlement unit, and an owner membership', async () => {
  const res = await fetch(`${baseUrl}/api/trips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify(validTripBody),
  });

  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.trip.name, 'Goa Trip 2026');
  assert.equal(data.trip.currency, 'INR', 'currency should be uppercased');
  assert.equal(data.trip.status, 'active');
  assert.ok(data.trip.join_code && data.trip.join_code.length === 7);
  assert.equal(data.membership.role, 'owner');
  assert.ok(data.membership.settlement_unit_id);

  createdTrip = data.trip;
  createdMembership = data.membership;
});

test('POST /api/trips rejects fixed_total budget with no budgetAmountMinor (422)', async () => {
  const res = await fetch(`${baseUrl}/api/trips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ ...validTripBody, budgetType: 'fixed_total', budgetAmountMinor: undefined }),
  });
  assert.equal(res.status, 422);
  const data = await res.json();
  assert.equal(data.error.code, 'VALIDATION_ERROR');
});

test('POST /api/trips rejects "unlimited" budget type WITH a budgetAmountMinor set (422)', async () => {
  const res = await fetch(`${baseUrl}/api/trips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ ...validTripBody, budgetType: 'unlimited', budgetAmountMinor: 1000 }),
  });
  assert.equal(res.status, 422);
});

test('POST /api/trips rejects endDate before startDate (422)', async () => {
  const res = await fetch(`${baseUrl}/api/trips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ ...validTripBody, startDate: '2026-08-05', endDate: '2026-08-01' }),
  });
  assert.equal(res.status, 422);
});

test('POST /api/trips requires authentication (401)', async () => {
  const res = await fetch(`${baseUrl}/api/trips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validTripBody),
  });
  assert.equal(res.status, 401);
});

test('POST /api/trips/join lets a second user join via the join code', async () => {
  const res = await fetch(`${baseUrl}/api/trips/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberToken}` },
    body: JSON.stringify({ joinCode: createdTrip.join_code }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.trip.id, createdTrip.id);
  assert.equal(data.membership.role, 'member');
  assert.notEqual(
    data.membership.settlement_unit_id,
    createdMembership.settlement_unit_id,
    'joiner should get their own individual settlement unit, not share the owner\'s'
  );
});

test('POST /api/trips/join rejects an unknown join code (404)', async () => {
  const res = await fetch(`${baseUrl}/api/trips/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${outsiderToken}` },
    body: JSON.stringify({ joinCode: 'NOTREAL' }),
  });
  assert.equal(res.status, 404);
  const data = await res.json();
  assert.equal(data.error.code, 'TRIP_NOT_FOUND');
});

// Pass 4 regression: the join code is always generated/displayed
// uppercase (see utils/joinCode.js's ALPHABET), and trips.join_code is
// matched with a case-sensitive `=` (tripRepository.findTripByJoinCode) -
// a manually-typed lowercase or mixed-case code must still match, which
// requires joinTripSchema's transform((v) => v.toUpperCase()) to actually
// run before that comparison. Covers exactly the reported bug: the
// join-code input's CSS text-transform: uppercase only changed how the
// value LOOKED, not the actual value React held and sent - so a manually
// typed code could visually match the displayed code while still being
// silently rejected as unknown.
test('POST /api/trips/join accepts a lower/mixed-case join code identical to the canonical uppercase one', async () => {
  // A dedicated user, not outsiderToken - later tests in this file rely
  // on outsiderToken belonging to NO trip in this suite (e.g. "outsider
  // cannot view/access this trip" checks), so reusing it here to
  // successfully join would silently break those.
  const { token: caseTestToken } = await registerAndLogin('trips_test_casecheck@example.com', 'Case Check');

  const mixedCaseCode = createdTrip.join_code
    .split('')
    .map((ch, i) => (i % 2 === 0 ? ch.toLowerCase() : ch))
    .join('');
  assert.notEqual(mixedCaseCode, createdTrip.join_code, 'sanity: the mixed-case variant must actually differ in case');

  const res = await fetch(`${baseUrl}/api/trips/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${caseTestToken}` },
    body: JSON.stringify({ joinCode: `  ${mixedCaseCode.toLowerCase()}  ` }), // also covers surrounding whitespace
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.trip.id, createdTrip.id);
});

test('POST /api/trips/join rejects joining a trip you are already in (409)', async () => {
  const res = await fetch(`${baseUrl}/api/trips/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberToken}` },
    body: JSON.stringify({ joinCode: createdTrip.join_code }),
  });
  assert.equal(res.status, 409);
  const data = await res.json();
  assert.equal(data.error.code, 'ALREADY_MEMBER');
});

test('GET /api/trips returns only trips the requester belongs to', async () => {
  const ownerRes = await fetch(`${baseUrl}/api/trips`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  const ownerData = await ownerRes.json();
  assert.ok(ownerData.trips.some((t) => t.id === createdTrip.id));

  const outsiderRes = await fetch(`${baseUrl}/api/trips`, {
    headers: { Authorization: `Bearer ${outsiderToken}` },
  });
  const outsiderData = await outsiderRes.json();
  assert.ok(!outsiderData.trips.some((t) => t.id === createdTrip.id));
});

test('GET /api/trips/:tripId returns full detail for a member', async () => {
  const res = await fetch(`${baseUrl}/api/trips/${createdTrip.id}`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.trip.id, createdTrip.id);
  assert.equal(data.members.length, 3, 'owner + joined member + case check member');
  assert.equal(data.settlementUnits.length, 3, 'three individual units so far');
});

test('GET /api/trips/:tripId returns 404 (not 403) for a non-member', async () => {
  const res = await fetch(`${baseUrl}/api/trips/${createdTrip.id}`, {
    headers: { Authorization: `Bearer ${outsiderToken}` },
  });
  assert.equal(res.status, 404);
  const data = await res.json();
  assert.equal(data.error.code, 'TRIP_NOT_FOUND');
});

test('GET /api/trips/:tripId returns 404 for a malformed tripId (not a raw DB error)', async () => {
  const res = await fetch(`${baseUrl}/api/trips/not-a-uuid`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  assert.equal(res.status, 404);
});

test('GET /api/trips/:tripId/members lists members with settlement unit info', async () => {
  const res = await fetch(`${baseUrl}/api/trips/${createdTrip.id}/members`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.members.length, 3);
  assert.ok(data.members.every((m) => m.settlement_unit_kind === 'individual'));
});

let familyUnit;

test('POST /api/trips/:tripId/settlement-units creates a group unit', async () => {
  const res = await fetch(`${baseUrl}/api/trips/${createdTrip.id}/settlement-units`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ displayName: 'Family A' }),
  });
  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.settlementUnit.kind, 'group');
  assert.equal(data.settlementUnit.display_name, 'Family A');
  familyUnit = data.settlementUnit;
});

test('POST /api/trips/:tripId/settlement-units rejects a duplicate name in the same trip (409)', async () => {
  const res = await fetch(`${baseUrl}/api/trips/${createdTrip.id}/settlement-units`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ displayName: 'Family A' }),
  });
  assert.equal(res.status, 409);
  const data = await res.json();
  assert.equal(data.error.code, 'GROUP_NAME_TAKEN');
});

test('PATCH .../members/me/settlement-unit creates a transfer request', async () => {
  const res = await fetch(`${baseUrl}/api/trips/${createdTrip.id}/members/me/settlement-unit`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberToken}` },
    body: JSON.stringify({ settlementUnitId: familyUnit.id }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.transferRequest.status, 'pending');

  const approveRes = await fetch(`${baseUrl}/api/trips/${createdTrip.id}/transfer-requests/${data.transferRequest.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  assert.equal(approveRes.status, 200);
  const approveData = await approveRes.json();
  assert.equal(approveData.membership.settlement_unit_id, familyUnit.id);
});

test('a second member joining and moving into the same group unit forms a 2-person family', async () => {
  const { token: secondMemberToken } = await registerAndLogin('trips_test_family2@example.com', 'Family Member Two');

  const joinRes = await fetch(`${baseUrl}/api/trips/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secondMemberToken}` },
    body: JSON.stringify({ joinCode: createdTrip.join_code }),
  });
  assert.equal(joinRes.status, 200);

  const moveRes = await fetch(`${baseUrl}/api/trips/${createdTrip.id}/members/me/settlement-unit`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secondMemberToken}` },
    body: JSON.stringify({ settlementUnitId: familyUnit.id }),
  });
  assert.equal(moveRes.status, 200);
  const moveData = await moveRes.json();

  await fetch(`${baseUrl}/api/trips/${createdTrip.id}/transfer-requests/${moveData.transferRequest.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}` },
  });

  const membersRes = await fetch(`${baseUrl}/api/trips/${createdTrip.id}/members`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  const membersData = await membersRes.json();
  const familyMembers = membersData.members.filter((m) => m.settlement_unit_id === familyUnit.id);
  assert.equal(familyMembers.length, 2, 'two people should now be grouped under Family A');
});

test('PATCH .../members/me/settlement-unit rejects moving into an individual-kind unit (400)', async () => {
  const res = await fetch(`${baseUrl}/api/trips/${createdTrip.id}/members/me/settlement-unit`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ settlementUnitId: createdMembership.settlement_unit_id }),
  });
  // owner moving into their OWN individual unit - still rejected, since the
  // rule is "must be a group unit", regardless of ownership
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error.code, 'NOT_A_GROUP_UNIT');
});

test('POST /api/trips/:tripId/settlement-units requires trip membership (404 for outsider)', async () => {
  const res = await fetch(`${baseUrl}/api/trips/${createdTrip.id}/settlement-units`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${outsiderToken}` },
    body: JSON.stringify({ displayName: 'Should Not Work' }),
  });
  assert.equal(res.status, 404);
});

test('Phase 1 /api/health still works with Phase 3 routes mounted alongside it', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'ok');
});
