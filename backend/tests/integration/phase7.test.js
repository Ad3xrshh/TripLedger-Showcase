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

let server;
let baseUrl;

const PASSWORD = 'Password123!';
const EMAIL_PREFIX = 'phase7_test_';

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

// Automatic verification mode by default - expenses become "verified"
// immediately on creation, so most settlement tests don't need a separate
// approval step. Tests that specifically need pending/rejected expenses
// override verificationMode.
async function createTrip(token, tripOverrides = {}) {
  const res = await fetch(`${baseUrl}/api/trips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: 'Phase 7 Test Trip',
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

async function approveExpense(token, tripId, expenseId) {
  const res = await fetch(`${baseUrl}/api/trips/${tripId}/expenses/${expenseId}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, data: await res.json() };
}

async function rejectExpense(token, tripId, expenseId) {
  const res = await fetch(`${baseUrl}/api/trips/${tripId}/expenses/${expenseId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ reason: 'test rejection' }),
  });
  return { status: res.status, data: await res.json() };
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
  return res.json();
}

async function getSettlement(token, tripId) {
  const res = await fetch(`${baseUrl}/api/trips/${tripId}/settlement`, {
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

function findBalance(data, settlementUnitId) {
  return data.balances.find((b) => b.settlementUnitId === settlementUnitId);
}

// ---------------------------------------------------------------------------
// BASIC FAIR SHARE
// ---------------------------------------------------------------------------

test('S1. Two participants, equal split, one payer', async () => {
  const a = await registerAndLogin('s1_a', 'S1 A');
  const b = await registerAndLogin('s1_b', 'S1 B');
  const { trip, membership: aMembership } = await createTrip(a.token);
  const { membership: bMembership } = await joinTrip(b.token, trip.join_code);

  await createExpense(a.token, trip.id, {
    amountMinor: 10000,
    participantSettlementUnitIds: [aMembership.settlement_unit_id, bMembership.settlement_unit_id],
  });

  const { status, data } = await getSettlement(a.token, trip.id);
  assert.equal(status, 200);
  assert.equal(data.totalVerifiedExpensesMinor, 10000);
  assert.equal(data.settlementUnitCount, 2);

  const balA = findBalance(data, aMembership.settlement_unit_id);
  const balB = findBalance(data, bMembership.settlement_unit_id);
  assert.equal(balA.totalPaidMinor, 10000);
  assert.equal(balA.fairShareMinor, 5000);
  assert.equal(balA.netBalanceMinor, 5000);
  assert.equal(balA.status, 'receives');
  assert.equal(balB.netBalanceMinor, -5000);
  assert.equal(balB.status, 'owes');
});

test('S2. Three participants, equal split', async () => {
  const a = await registerAndLogin('s2_a', 'S2 A');
  const b = await registerAndLogin('s2_b', 'S2 B');
  const c = await registerAndLogin('s2_c', 'S2 C');
  const { trip, membership: aM } = await createTrip(a.token);
  const { membership: bM } = await joinTrip(b.token, trip.join_code);
  const { membership: cM } = await joinTrip(c.token, trip.join_code);

  await createExpense(a.token, trip.id, {
    amountMinor: 900,
    participantSettlementUnitIds: [aM.settlement_unit_id, bM.settlement_unit_id, cM.settlement_unit_id],
  });

  const { data } = await getSettlement(a.token, trip.id);
  assert.equal(findBalance(data, aM.settlement_unit_id).fairShareMinor, 300);
  assert.equal(findBalance(data, bM.settlement_unit_id).fairShareMinor, 300);
  assert.equal(findBalance(data, cM.settlement_unit_id).fairShareMinor, 300);
});

// ---------------------------------------------------------------------------
// DIFFERENT PARTICIPANT SETS
// ---------------------------------------------------------------------------

test('S3. Different participant sets across expenses - excluded unit is not charged', async () => {
  const a = await registerAndLogin('s3_a', 'S3 A');
  const b = await registerAndLogin('s3_b', 'S3 B');
  const c = await registerAndLogin('s3_c', 'S3 C');
  const { trip, membership: aM } = await createTrip(a.token);
  const { membership: bM } = await joinTrip(b.token, trip.join_code);
  const { membership: cM } = await joinTrip(c.token, trip.join_code);

  await createExpense(a.token, trip.id, {
    amountMinor: 900,
    participantSettlementUnitIds: [aM.settlement_unit_id, bM.settlement_unit_id, cM.settlement_unit_id],
  });
  await createExpense(a.token, trip.id, {
    amountMinor: 600,
    participantSettlementUnitIds: [aM.settlement_unit_id, bM.settlement_unit_id], // C excluded
  });

  const { data } = await getSettlement(a.token, trip.id);
  const balC = findBalance(data, cM.settlement_unit_id);
  assert.equal(balC.fairShareMinor, 300); // only from expense 1
  assert.equal(data.totalVerifiedExpensesMinor, 1500);
});

// ---------------------------------------------------------------------------
// PAYMENT IMBALANCE / SETTLEMENT TRANSACTIONS
// ---------------------------------------------------------------------------

test('S4. Simple imbalance produces a single settlement transaction', async () => {
  const a = await registerAndLogin('s4_a', 'S4 A');
  const b = await registerAndLogin('s4_b', 'S4 B');
  const { trip, membership: aM } = await createTrip(a.token);
  const { membership: bM } = await joinTrip(b.token, trip.join_code);

  await createExpense(a.token, trip.id, {
    amountMinor: 26000,
    participantSettlementUnitIds: [aM.settlement_unit_id, bM.settlement_unit_id],
  });
  await createExpense(b.token, trip.id, {
    amountMinor: 14000,
    participantSettlementUnitIds: [aM.settlement_unit_id, bM.settlement_unit_id],
  });

  const { data } = await getSettlement(a.token, trip.id);
  // A paid 26000, B paid 14000, total 40000, fair share 20000 each.
  // A net = +6000, B net = -6000.
  assert.equal(data.transactions.length, 1);
  assert.equal(data.transactions[0].fromSettlementUnitId, bM.settlement_unit_id);
  assert.equal(data.transactions[0].toSettlementUnitId, aM.settlement_unit_id);
  assert.equal(data.transactions[0].amountMinor, 6000);
});

test('S5. Multiple creditors and multiple debtors settle correctly', async () => {
  const a = await registerAndLogin('s5_a', 'S5 A');
  const b = await registerAndLogin('s5_b', 'S5 B');
  const c = await registerAndLogin('s5_c', 'S5 C');
  const d = await registerAndLogin('s5_d', 'S5 D');
  const { trip, membership: aM } = await createTrip(a.token);
  const { membership: bM } = await joinTrip(b.token, trip.join_code);
  const { membership: cM } = await joinTrip(c.token, trip.join_code);
  const { membership: dM } = await joinTrip(d.token, trip.join_code);
  const units = [aM.settlement_unit_id, bM.settlement_unit_id, cM.settlement_unit_id, dM.settlement_unit_id];

  // Total paid by A = 33000, B = 15000. Total = 48000, fair share = 12000 each.
  // A net = +21000, B net = +3000, C net = -12000, D net = -12000.
  await createExpense(a.token, trip.id, { amountMinor: 33000, participantSettlementUnitIds: units });
  await createExpense(b.token, trip.id, { amountMinor: 15000, participantSettlementUnitIds: units });

  const { data } = await getSettlement(a.token, trip.id);

  const sumNet = data.balances.reduce((s, x) => s + x.netBalanceMinor, 0);
  assert.equal(sumNet, 0);

  const totalTxnAmount = data.transactions.reduce((s, t) => s + t.amountMinor, 0);
  assert.equal(totalTxnAmount, 24000); // total owed by debtors C + D

  for (const t of data.transactions) {
    assert.ok(t.amountMinor > 0);
    assert.notEqual(t.fromSettlementUnitId, t.toSettlementUnitId);
  }
});

// ---------------------------------------------------------------------------
// REMAINDERS
// ---------------------------------------------------------------------------

test('S6. 100 minor units / 3 participants - exact conservation with remainder', async () => {
  const a = await registerAndLogin('s6_a', 'S6 A');
  const b = await registerAndLogin('s6_b', 'S6 B');
  const c = await registerAndLogin('s6_c', 'S6 C');
  const { trip, membership: aM } = await createTrip(a.token);
  const { membership: bM } = await joinTrip(b.token, trip.join_code);
  const { membership: cM } = await joinTrip(c.token, trip.join_code);

  await createExpense(a.token, trip.id, {
    amountMinor: 100,
    participantSettlementUnitIds: [aM.settlement_unit_id, bM.settlement_unit_id, cM.settlement_unit_id],
  });

  const { data } = await getSettlement(a.token, trip.id);
  const totalFairShare = data.balances.reduce((s, x) => s + x.fairShareMinor, 0);
  assert.equal(totalFairShare, 100);
  const sumNet = data.balances.reduce((s, x) => s + x.netBalanceMinor, 0);
  assert.equal(sumNet, 0);
});

// ---------------------------------------------------------------------------
// ZERO CASES
// ---------------------------------------------------------------------------

test('S7. Trip with zero expenses returns all-zero balances, no transactions', async () => {
  const a = await registerAndLogin('s7_a', 'S7 A');
  const { trip } = await createTrip(a.token);

  const { status, data } = await getSettlement(a.token, trip.id);
  assert.equal(status, 200);
  assert.equal(data.totalVerifiedExpensesMinor, 0);
  assert.equal(data.transactions.length, 0);
  for (const b of data.balances) {
    assert.equal(b.netBalanceMinor, 0);
    assert.equal(b.status, 'settled');
  }
});

test('S8. Settlement unit with no expenses appears with zero balance', async () => {
  const a = await registerAndLogin('s8_a', 'S8 A');
  const b = await registerAndLogin('s8_b', 'S8 B');
  const { trip, membership: aM } = await createTrip(a.token);
  const { membership: bM } = await joinTrip(b.token, trip.join_code);

  // B never pays or participates in anything.
  await createExpense(a.token, trip.id, {
    amountMinor: 1000,
    participantSettlementUnitIds: [aM.settlement_unit_id],
  });

  const { data } = await getSettlement(a.token, trip.id);
  const balB = findBalance(data, bM.settlement_unit_id);
  assert.ok(balB, 'expected unit B to appear even with zero involvement');
  assert.equal(balB.totalPaidMinor, 0);
  assert.equal(balB.fairShareMinor, 0);
  assert.equal(balB.netBalanceMinor, 0);
  assert.equal(balB.status, 'settled');
});

// ---------------------------------------------------------------------------
// EXPENSE STATUS FILTERING
// ---------------------------------------------------------------------------

test('S9. Pending expenses are excluded from settlement', async () => {
  const a = await registerAndLogin('s9_a', 'S9 A');
  const b = await registerAndLogin('s9_b', 'S9 B');
  const { trip, membership: aM } = await createTrip(a.token, { verificationMode: 'member_approval' });
  const { membership: bM } = await joinTrip(b.token, trip.join_code);

  await createExpense(a.token, trip.id, {
    amountMinor: 5000,
    participantSettlementUnitIds: [aM.settlement_unit_id, bM.settlement_unit_id],
  });
  // No approval - stays pending.

  const { data } = await getSettlement(a.token, trip.id);
  assert.equal(data.totalVerifiedExpensesMinor, 0);
});

test('S10. Rejected expenses are excluded from settlement', async () => {
  const a = await registerAndLogin('s10_a', 'S10 A');
  const b = await registerAndLogin('s10_b', 'S10 B');
  const { trip, membership: aM } = await createTrip(a.token, { verificationMode: 'member_approval' });
  const { membership: bM } = await joinTrip(b.token, trip.join_code);

  const { data: expenseRes } = await createExpense(a.token, trip.id, {
    amountMinor: 5000,
    participantSettlementUnitIds: [aM.settlement_unit_id, bM.settlement_unit_id],
  });
  await rejectExpense(b.token, trip.id, expenseRes.expense.id);

  const { data } = await getSettlement(a.token, trip.id);
  assert.equal(data.totalVerifiedExpensesMinor, 0);
});

test('S11. Verified expenses are included after approval', async () => {
  const a = await registerAndLogin('s11_a', 'S11 A');
  const b = await registerAndLogin('s11_b', 'S11 B');
  const { trip, membership: aM } = await createTrip(a.token, { verificationMode: 'member_approval' });
  const { membership: bM } = await joinTrip(b.token, trip.join_code);

  const { data: expenseRes } = await createExpense(a.token, trip.id, {
    amountMinor: 5000,
    participantSettlementUnitIds: [aM.settlement_unit_id, bM.settlement_unit_id],
  });
  await approveExpense(b.token, trip.id, expenseRes.expense.id);

  const { data } = await getSettlement(a.token, trip.id);
  assert.equal(data.totalVerifiedExpensesMinor, 5000);
});

// ---------------------------------------------------------------------------
// PAYER MAPPING
// ---------------------------------------------------------------------------

test('S12. Payer in settlement always matches the authenticated creator, never a client-supplied value', async () => {
  const a = await registerAndLogin('s12_a', 'S12 A');
  const b = await registerAndLogin('s12_b', 'S12 B');
  const { trip, membership: aM } = await createTrip(a.token);
  const { membership: bM } = await joinTrip(b.token, trip.join_code);

  // B creates the expense (no payer field exists on the request at all -
  // createExpenseSchema has no such field, and ExpenseService always uses
  // the authenticated tripMember as payer).
  await createExpense(b.token, trip.id, {
    amountMinor: 4000,
    participantSettlementUnitIds: [aM.settlement_unit_id, bM.settlement_unit_id],
  });

  const { data } = await getSettlement(a.token, trip.id);
  assert.equal(findBalance(data, bM.settlement_unit_id).totalPaidMinor, 4000);
  assert.equal(findBalance(data, aM.settlement_unit_id).totalPaidMinor, 0);
});

// ---------------------------------------------------------------------------
// GROUP SETTLEMENT UNITS (FAMILIES) - SPEC WORKED EXAMPLE
// ---------------------------------------------------------------------------

test('S13. Family A/B/C worked example from the Phase 7 spec', async () => {
  const owner = await registerAndLogin('s13_owner', 'S13 Owner');
  const memberB = await registerAndLogin('s13_b', 'S13 B');
  const memberC = await registerAndLogin('s13_c', 'S13 C');
  const { trip } = await createTrip(owner.token);
  await joinTrip(memberB.token, trip.join_code);
  await joinTrip(memberC.token, trip.join_code);

  const familyA = await createGroupUnit(owner.token, trip.id, 'S13 Family A');
  const familyB = await createGroupUnit(owner.token, trip.id, 'S13 Family B');
  const familyC = await createGroupUnit(owner.token, trip.id, 'S13 Family C');

  await moveIntoUnit(owner.token, trip.id, familyA.settlementUnit.id);
  await moveIntoUnit(memberB.token, trip.id, familyB.settlementUnit.id);
  await moveIntoUnit(memberC.token, trip.id, familyC.settlementUnit.id);

  const units = [familyA.settlementUnit.id, familyB.settlementUnit.id, familyC.settlementUnit.id];

  // Amounts are each a multiple of 3 (30000, 18000, 12000) so every
  // expense divides evenly among the 3 families with no remainder - this
  // keeps the expected balances exact and deterministic regardless of the
  // real (DB-generated, unpredictable-at-test-write-time) UUID sort order
  // that the remainder rule would otherwise use as a tiebreaker. Remainder
  // allocation itself is covered separately (S6, and the dedicated
  // divideAmount unit tests).
  await createExpense(owner.token, trip.id, { amountMinor: 30000, participantSettlementUnitIds: units });
  await createExpense(memberB.token, trip.id, { amountMinor: 18000, participantSettlementUnitIds: units });
  await createExpense(memberC.token, trip.id, { amountMinor: 12000, participantSettlementUnitIds: units });

  const { data } = await getSettlement(owner.token, trip.id);
  assert.equal(data.totalVerifiedExpensesMinor, 60000);

  // Fair share is exactly 20000 each (60000 / 3, with every contributing
  // expense itself divisible by 3 - no remainder anywhere in this case).
  const balA = findBalance(data, familyA.settlementUnit.id);
  const balB = findBalance(data, familyB.settlementUnit.id);
  const balC = findBalance(data, familyC.settlementUnit.id);
  assert.equal(balA.fairShareMinor, 20000);
  assert.equal(balB.fairShareMinor, 20000);
  assert.equal(balC.fairShareMinor, 20000);
  assert.equal(balA.netBalanceMinor, 10000); // paid 30000, owes 20000 -> receives 10000
  assert.equal(balB.netBalanceMinor, -2000); // paid 18000, owes 20000 -> owes 2000
  assert.equal(balC.netBalanceMinor, -8000); // paid 12000, owes 20000 -> owes 8000
  assert.equal(balA.status, 'receives');
  assert.equal(balB.status, 'owes');
  assert.equal(balC.status, 'owes');

  // Two debtors (B: 2000, C: 8000) settling against one creditor (A: 10000).
  assert.equal(data.transactions.length, 2);
  const totalToA = data.transactions
    .filter((t) => t.toSettlementUnitId === familyA.settlementUnit.id)
    .reduce((s, t) => s + t.amountMinor, 0);
  assert.equal(totalToA, 10000);
  for (const t of data.transactions) {
    assert.equal(t.toSettlementUnitId, familyA.settlementUnit.id);
    assert.equal(t.toSettlementUnitName, 'S13 Family A');
    assert.ok([familyB.settlementUnit.id, familyC.settlementUnit.id].includes(t.fromSettlementUnitId));
  }
});

// ---------------------------------------------------------------------------
// CONSERVATION (across a larger/uneven scenario)
// ---------------------------------------------------------------------------

test('S14. Conservation holds: sum(netBalance) === 0 and settlement transfers match debtor total', async () => {
  const a = await registerAndLogin('s14_a', 'S14 A');
  const b = await registerAndLogin('s14_b', 'S14 B');
  const c = await registerAndLogin('s14_c', 'S14 C');
  const { trip, membership: aM } = await createTrip(a.token);
  const { membership: bM } = await joinTrip(b.token, trip.join_code);
  const { membership: cM } = await joinTrip(c.token, trip.join_code);
  const units = [aM.settlement_unit_id, bM.settlement_unit_id, cM.settlement_unit_id];

  await createExpense(a.token, trip.id, { amountMinor: 777, participantSettlementUnitIds: units });
  await createExpense(b.token, trip.id, { amountMinor: 233, participantSettlementUnitIds: [aM.settlement_unit_id, bM.settlement_unit_id] });

  const { data } = await getSettlement(a.token, trip.id);
  const sumNet = data.balances.reduce((s, x) => s + x.netBalanceMinor, 0);
  assert.equal(sumNet, 0);

  const debtorTotal = data.balances
    .filter((x) => x.netBalanceMinor < 0)
    .reduce((s, x) => s + Math.abs(x.netBalanceMinor), 0);
  const txnTotal = data.transactions.reduce((s, t) => s + t.amountMinor, 0);
  assert.equal(txnTotal, debtorTotal);
});

// ---------------------------------------------------------------------------
// DETERMINISM
// ---------------------------------------------------------------------------

test('S15. Repeated GET requests for the same trip state return identical output', async () => {
  const a = await registerAndLogin('s15_a', 'S15 A');
  const b = await registerAndLogin('s15_b', 'S15 B');
  const { trip, membership: aM } = await createTrip(a.token);
  const { membership: bM } = await joinTrip(b.token, trip.join_code);

  await createExpense(a.token, trip.id, {
    amountMinor: 777,
    participantSettlementUnitIds: [aM.settlement_unit_id, bM.settlement_unit_id],
  });

  const first = await getSettlement(a.token, trip.id);
  const second = await getSettlement(a.token, trip.id);
  assert.deepEqual(first.data, second.data);
});

// ---------------------------------------------------------------------------
// SECURITY
// ---------------------------------------------------------------------------

test('S16. Unauthenticated request is rejected with 401', async () => {
  const a = await registerAndLogin('s16_a', 'S16 A');
  const { trip } = await createTrip(a.token);

  const res = await fetch(`${baseUrl}/api/trips/${trip.id}/settlement`);
  assert.equal(res.status, 401);
});

test('S17. Non-member cannot access settlement (404 non-leaking)', async () => {
  const a = await registerAndLogin('s17_a', 'S17 A');
  const outsider = await registerAndLogin('s17_outsider', 'S17 Outsider');
  const { trip } = await createTrip(a.token);

  const { status } = await getSettlement(outsider.token, trip.id);
  assert.equal(status, 404);
});

test('S18. Cross-trip data cannot affect settlement', async () => {
  const a = await registerAndLogin('s18_a', 'S18 A');
  const other = await registerAndLogin('s18_other', 'S18 Other');
  const { trip: tripA, membership: aM } = await createTrip(a.token);
  const { trip: tripOther, membership: otherM } = await createTrip(other.token);

  await createExpense(a.token, tripA.id, {
    amountMinor: 2000,
    participantSettlementUnitIds: [aM.settlement_unit_id],
  });
  await createExpense(other.token, tripOther.id, {
    amountMinor: 999999,
    participantSettlementUnitIds: [otherM.settlement_unit_id],
  });

  const { data } = await getSettlement(a.token, tripA.id);
  assert.equal(data.totalVerifiedExpensesMinor, 2000);
  assert.equal(data.settlementUnitCount, 1);
  assert.equal(findBalance(data, otherM.settlement_unit_id), undefined);
});
