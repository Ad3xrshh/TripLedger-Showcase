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
const EMAIL_PREFIX = 'empty_unit_test_';

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

async function createTrip(token, tripOverrides = {}) {
  const res = await fetch(`${baseUrl}/api/trips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: 'Empty Unit Presentation Test Trip',
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

async function getSettlement(token, tripId) {
  const res = await fetch(`${baseUrl}/api/trips/${tripId}/settlement`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, data: await res.json() };
}

function findBalance(data, settlementUnitId) {
  return data.balances.find((b) => b.settlementUnitId === settlementUnitId);
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
// 9.9.9 QA fix #6 regression: reproduces the exact reported scenario
// (skibidiguy starts in Fam A; Adarsh joins and lands in Fam B;
// skibidiguy later moves Fam A -> Fam C; expenses happen before and
// after the move) and proves:
//
//   1. a unit with NO expense history and 0 active members (Fam D, and
//      skibidiguy's own auto-created individual unit, never used before
//      the move into Fam A) is no longer surfaced as a misleading
//      "Settled ₹0" balance row - the actual bug this QA pass fixes;
//   2. a unit that DOES have real historical expense activity (Fam A -
//      it was the payer AND sole participant of "snacks" before
//      everyone left it) still appears, correctly settled at exactly
//      zero - proving historical payer/unit integrity from Batch 1 is
//      completely unaffected by this presentation-only change;
//   3. the money itself - who owes whom, and how much - is unchanged
//      and still conserves to zero.
// ---------------------------------------------------------------------------

test('QA fix #6: an empty, never-used settlement unit no longer appears in the live settlement balances', async () => {
  const skibidiguy = await registerAndLogin('skibidiguy', 'skibidiguy');
  const { trip, membership: skibidiguyIndividualM } = await createTrip(skibidiguy.token);

  const { data: famAData } = { data: await createGroupUnit(skibidiguy.token, trip.id, 'Fam A') };
  const { data: famBData } = { data: await createGroupUnit(skibidiguy.token, trip.id, 'Fam B') };
  const { data: famCData } = { data: await createGroupUnit(skibidiguy.token, trip.id, 'Fam C') };
  const { data: famDData } = { data: await createGroupUnit(skibidiguy.token, trip.id, 'Fam D') };
  const famA = famAData.settlementUnit;
  const famB = famBData.settlementUnit;
  const famC = famCData.settlementUnit;
  const famD = famDData.settlementUnit;

  // skibidiguy starts in Fam A - moving out of their auto-created
  // individual unit means that unit is now empty AND was never used by
  // any expense (matches skibidiguyIndividualM's unit never being a
  // payer/participant below).
  const moveIntoA = await moveIntoUnit(skibidiguy.token, trip.id, famA.id);
  assert.equal(moveIntoA.membership.settlement_unit_id, famA.id);

  // Expense 1 "snacks": payer = skibidiguy (currently in Fam A),
  // participants = Fam A only.
  const { status: e1Status } = await createExpense(skibidiguy.token, trip.id, {
    amountMinor: 30000,
    description: 'snacks',
    participantSettlementUnitIds: [famA.id],
  });
  assert.equal(e1Status, 201);

  // Adarsh joins the trip and moves into Fam B.
  const adarsh = await registerAndLogin('adarsh', 'Adarsh');
  const { membership: adarshM } = await joinTrip(adarsh.token, trip.join_code);
  const moveIntoB = await moveIntoUnit(adarsh.token, trip.id, famB.id);
  assert.equal(moveIntoB.membership.settlement_unit_id, famB.id);

  // skibidiguy moves Fam A -> Fam C. Fam A now has 0 active members.
  const moveIntoC = await moveIntoUnit(skibidiguy.token, trip.id, famC.id);
  assert.equal(moveIntoC.membership.settlement_unit_id, famC.id);

  // Expense 2 "Icecream": payer = Adarsh (Fam B), participants = Fam B + Fam C.
  const { status: e2Status } = await createExpense(adarsh.token, trip.id, {
    amountMinor: 20000,
    description: 'Icecream',
    participantSettlementUnitIds: [famB.id, famC.id],
  });
  assert.equal(e2Status, 201);

  // Expense 3 "8 Ball": payer = skibidiguy (now Fam C), participants = Fam C only.
  const { status: e3Status } = await createExpense(skibidiguy.token, trip.id, {
    amountMinor: 10000,
    description: '8 Ball',
    participantSettlementUnitIds: [famC.id],
  });
  assert.equal(e3Status, 201);

  // Expense 4 "Home": payer = skibidiguy (Fam C), participants = Fam B + Fam C.
  const { status: e4Status } = await createExpense(skibidiguy.token, trip.id, {
    amountMinor: 40000,
    description: 'Home',
    participantSettlementUnitIds: [famB.id, famC.id],
  });
  assert.equal(e4Status, 201);

  const { status, data } = await getSettlement(skibidiguy.token, trip.id);
  assert.equal(status, 200);

  // --- 1. Genuinely empty, never-used units are no longer manufactured
  //        into the balances list. ---
  assert.equal(
    findBalance(data, famD.id),
    undefined,
    'Fam D (0 active members, never referenced by any expense) must not appear in balances'
  );
  assert.equal(
    findBalance(data, skibidiguyIndividualM.settlement_unit_id),
    undefined,
    "skibidiguy's original individual unit (0 active members, never referenced by any expense) must not appear in balances"
  );

  // --- 2. A unit with genuine historical expense activity, even with 0
  //        active members now, still appears - correctly settled at
  //        exactly zero, not hidden and not misrepresented as "owing". ---
  const famABalance = findBalance(data, famA.id);
  assert.ok(famABalance, 'Fam A must still appear - it has real historical expense activity');
  assert.equal(famABalance.totalPaidMinor, 30000);
  assert.equal(famABalance.fairShareMinor, 30000);
  assert.equal(famABalance.netBalanceMinor, 0);
  assert.equal(famABalance.status, 'settled');

  // Fam A must not be a party to any who-pays-whom transaction.
  const famAInvolved = data.transactions.some(
    (t) => t.fromSettlementUnitId === famA.id || t.toSettlementUnitId === famA.id
  );
  assert.equal(famAInvolved, false, 'Fam A has a net balance of zero and must not appear in any transaction');

  // --- 3. The actual money is unchanged: Fam B paid 20000, owes fair
  //        shares of 10000 (icecream) + 20000 (home) = 30000, so nets to
  //        owing 10000. Fam C paid 10000 + 40000 = 50000, owes fair
  //        shares of 10000 (icecream) + 10000 (8 ball) + 20000 (home) =
  //        40000, so nets to receiving 10000. Conservation holds. ---
  const famBBalance = findBalance(data, famB.id);
  const famCBalance = findBalance(data, famC.id);
  assert.ok(famBBalance && famCBalance);

  assert.equal(famBBalance.totalPaidMinor, 20000);
  assert.equal(famBBalance.fairShareMinor, 30000);
  assert.equal(famBBalance.netBalanceMinor, -10000);
  assert.equal(famBBalance.status, 'owes');

  assert.equal(famCBalance.totalPaidMinor, 50000);
  assert.equal(famCBalance.fairShareMinor, 40000);
  assert.equal(famCBalance.netBalanceMinor, 10000);
  assert.equal(famCBalance.status, 'receives');

  const conservedSum = data.balances.reduce((sum, b) => sum + b.netBalanceMinor, 0);
  assert.equal(conservedSum, 0, 'net balances must always conserve to exactly zero');

  const txn = data.transactions.find(
    (t) => t.fromSettlementUnitId === famB.id && t.toSettlementUnitId === famC.id
  );
  assert.ok(txn, 'Fam B must owe Fam C');
  assert.equal(txn.amountMinor, 10000);
  assert.equal(data.transactions.length, 1, 'exactly one transaction should settle the whole trip');
});
