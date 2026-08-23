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
import approvalRuleRoutes from '../../src/routes/approvalRuleRoutes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { insertApprovalRule } from '../../src/repositories/expenseApprovalRepository.js';

let server;
let baseUrl;

const PASSWORD = 'Password123!';
const EMAIL_PREFIX = 'approval_test_';

async function cleanupTestData() {
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
  const payload = {
    name: 'Approval Test Trip',
    budgetType: 'fixed_total',
    budgetAmountMinor: 100000,
    fairShareMethod: 'equal_per_unit',
    verificationMode: 'member_approval',
    ...tripOverrides,
  };
  if (payload.budgetType === 'unlimited') {
    delete payload.budgetAmountMinor;
  }
  const res = await fetch(`${baseUrl}/api/trips`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function joinTrip(token, joinCode) {
  const res = await fetch(`${baseUrl}/api/trips/join`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ joinCode }),
  });
  return res.json();
}

async function createExpense(token, tripId, expenseOverrides = {}) {
  const res = await fetch(`${baseUrl}/api/trips/${tripId}/expenses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      amountMinor: 2000,
      description: 'Dinner',
      category: 'Food',
      occurredAt: '2026-08-09T18:00:00.000Z',
      ...expenseOverrides,
    }),
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
  app.use('/api/trips/:tripId/budget', budgetRoutes);
  app.use('/api/trips/:tripId/approval-rules', approvalRuleRoutes);
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

test('1. Valid member approval in member_approval mode', async () => {
  const payer = await registerAndLogin('payer1', 'Payer One');
  const approver = await registerAndLogin('approver1', 'Approver One');

  const { trip } = await createTrip(payer.token, { verificationMode: 'member_approval' });
  await joinTrip(approver.token, trip.join_code);

  const { data: expenseRes } = await createExpense(payer.token, trip.id);
  const expenseId = expenseRes.expense.id;
  assert.equal(expenseRes.expense.status, 'pending');

  const approveRes = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${expenseId}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${approver.token}` },
  });
  assert.equal(approveRes.status, 200);
  const approveData = await approveRes.json();

  assert.equal(approveData.expense.status, 'verified');
  assert.equal(approveData.verification.approvalsReceived, 1);
  assert.equal(approveData.verification.currentUserApproved, true);
});

test('2. Payer cannot approve their own expense (CANNOT_SELF_APPROVE)', async () => {
  const payer = await registerAndLogin('payer2', 'Payer Two');
  const member = await registerAndLogin('member2', 'Member Two');

  const { trip } = await createTrip(payer.token, { verificationMode: 'member_approval' });
  await joinTrip(member.token, trip.join_code);

  const { data: expenseRes } = await createExpense(payer.token, trip.id);
  const expenseId = expenseRes.expense.id;

  const selfApproveRes = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${expenseId}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${payer.token}` },
  });
  assert.equal(selfApproveRes.status, 400);
  const errData = await selfApproveRes.json();
  assert.equal(errData.error.code, 'CANNOT_SELF_APPROVE');
});

test('3. Non-member cannot approve an expense (404 non-leaking)', async () => {
  const payer = await registerAndLogin('payer3', 'Payer Three');
  const outsider = await registerAndLogin('outsider3', 'Outsider Three');

  const { trip } = await createTrip(payer.token, { verificationMode: 'member_approval' });
  const { data: expenseRes } = await createExpense(payer.token, trip.id);

  const res = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${expenseRes.expense.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${outsider.token}` },
  });
  assert.equal(res.status, 404);
});

test('4. Cross-trip approval is rejected (404 non-leaking)', async () => {
  const ownerA = await registerAndLogin('ownerA', 'Owner A');
  const ownerB = await registerAndLogin('ownerB', 'Owner B');

  const { trip: tripA } = await createTrip(ownerA.token);
  const { trip: tripB } = await createTrip(ownerB.token);

  const { data: expenseA } = await createExpense(ownerA.token, tripA.id);

  // Owner B tries to approve expenseA via tripB's URL
  const res = await fetch(`${baseUrl}/api/trips/${tripB.id}/expenses/${expenseA.expense.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerB.token}` },
  });
  assert.equal(res.status, 404);
});

test('5. Client-supplied member ID in request body cannot impersonate another member', async () => {
  const payer = await registerAndLogin('payer5', 'Payer Five');
  const approver = await registerAndLogin('approver5', 'Approver Five');
  const victim = await registerAndLogin('victim5', 'Victim Five');

  const { trip } = await createTrip(payer.token);
  await joinTrip(approver.token, trip.join_code);
  await joinTrip(victim.token, trip.join_code);

  const { data: expenseRes } = await createExpense(payer.token, trip.id);

  const res = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${expenseRes.expense.id}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${approver.token}`,
    },
    body: JSON.stringify({ memberId: victim.user.id }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();

  // The approval must record approver's member ID, NOT victim's ID
  const approvedMemberIds = data.verification.approvedBy.map((a) => a.memberId);
  assert.equal(approvedMemberIds.length, 1);
  assert.notEqual(approvedMemberIds[0], victim.user.id);
});

test('6. Client-supplied status in body cannot force verification', async () => {
  const payer = await registerAndLogin('payer6', 'Payer Six');
  const approver = await registerAndLogin('approver6', 'Approver Six');
  const approver2 = await registerAndLogin('approver6_2', 'Approver Six Two');

  const { trip } = await createTrip(payer.token);
  await joinTrip(approver.token, trip.join_code);
  await joinTrip(approver2.token, trip.join_code);

  // Set rule requiring 2 approvals
  await insertApprovalRule(pool, {
    tripId: trip.id,
    minAmountMinor: 0,
    maxAmountMinor: null,
    requiredApprovals: 2,
  });

  const { data: expenseRes } = await createExpense(payer.token, trip.id);

  const res = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${expenseRes.expense.id}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${approver.token}`,
    },
    body: JSON.stringify({ status: 'verified' }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  // Threshold is 2, only 1 received -> expense stays pending despite status: verified in body!
  assert.equal(data.expense.status, 'pending');
});

test('7. Duplicate approval is rejected (409 ALREADY_APPROVED)', async () => {
  const payer = await registerAndLogin('payer7', 'Payer Seven');
  const approver = await registerAndLogin('approver7', 'Approver Seven');
  const member = await registerAndLogin('member7', 'Member Seven');

  const { trip } = await createTrip(payer.token);
  await joinTrip(approver.token, trip.join_code);
  await joinTrip(member.token, trip.join_code);

  await insertApprovalRule(pool, {
    tripId: trip.id,
    minAmountMinor: 0,
    maxAmountMinor: null,
    requiredApprovals: 2,
  });

  const { data: expenseRes } = await createExpense(payer.token, trip.id);

  const res1 = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${expenseRes.expense.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${approver.token}` },
  });
  assert.equal(res1.status, 200);

  const res2 = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${expenseRes.expense.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${approver.token}` },
  });
  assert.equal(res2.status, 409);
  const errData = await res2.json();
  assert.equal(errData.error.code, 'ALREADY_APPROVED');
});

test('8–11. Member approval mode: pending before threshold, verified at threshold', async () => {
  const payer = await registerAndLogin('payer8', 'Payer Eight');
  const approver1 = await registerAndLogin('approver8_1', 'Approver 8.1');
  const approver2 = await registerAndLogin('approver8_2', 'Approver 8.2');

  const { trip } = await createTrip(payer.token);
  await joinTrip(approver1.token, trip.join_code);
  await joinTrip(approver2.token, trip.join_code);

  await insertApprovalRule(pool, {
    tripId: trip.id,
    minAmountMinor: 0,
    maxAmountMinor: null,
    requiredApprovals: 2,
  });

  const { data: exp } = await createExpense(payer.token, trip.id);
  assert.equal(exp.expense.status, 'pending');

  // Approver 1 approves -> received: 1 / required: 2 -> still pending
  const app1 = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${exp.expense.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${approver1.token}` },
  });
  const data1 = await app1.json();
  assert.equal(data1.expense.status, 'pending');

  // Approver 2 approves -> received: 2 / required: 2 -> transitions to verified!
  const app2 = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${exp.expense.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${approver2.token}` },
  });
  const data2 = await app2.json();
  assert.equal(data2.expense.status, 'verified');
});

test('12–15. Tiered approval mode: correct tier selection & threshold behavior', async () => {
  const payer = await registerAndLogin('payer12', 'Payer Twelve');
  const member1 = await registerAndLogin('member12_1', 'Member 12.1');
  const member2 = await registerAndLogin('member12_2', 'Member 12.2');

  const { trip } = await createTrip(payer.token, { verificationMode: 'tiered' });
  await joinTrip(member1.token, trip.join_code);
  await joinTrip(member2.token, trip.join_code);

  // Set up 2 tiers: Tier 1 (0 to 5000) -> 1 approval; Tier 2 (> 5000) -> 2 approvals
  await insertApprovalRule(pool, {
    tripId: trip.id,
    minAmountMinor: 0,
    maxAmountMinor: 5000,
    requiredApprovals: 1,
  });
  await insertApprovalRule(pool, {
    tripId: trip.id,
    minAmountMinor: 5001,
    maxAmountMinor: null,
    requiredApprovals: 2,
  });

  // Small expense: 3000 -> Tier 1 (1 approval needed)
  const { data: smallExp } = await createExpense(payer.token, trip.id, { amountMinor: 3000 });
  const appSmall = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${smallExp.expense.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${member1.token}` },
  });
  const dataSmall = await appSmall.json();
  assert.equal(dataSmall.expense.status, 'verified');

  // Large expense: 10000 -> Tier 2 (2 approvals needed)
  const { data: largeExp } = await createExpense(payer.token, trip.id, { amountMinor: 10000 });

  const appLarge1 = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${largeExp.expense.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${member1.token}` },
  });
  const dataLarge1 = await appLarge1.json();
  assert.equal(dataLarge1.expense.status, 'pending');

  const appLarge2 = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${largeExp.expense.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${member2.token}` },
  });
  const dataLarge2 = await appLarge2.json();
  assert.equal(dataLarge2.expense.status, 'verified');
});

test('16. Tiered mode with no matching approval_rules fails safely', async () => {
  const payer = await registerAndLogin('payer16', 'Payer Sixteen');
  const member = await registerAndLogin('member16', 'Member Sixteen');

  // Create tiered trip with NO approval rules configured
  const { trip } = await createTrip(payer.token, { verificationMode: 'tiered' });
  await joinTrip(member.token, trip.join_code);

  const { data: exp } = await createExpense(payer.token, trip.id, { amountMinor: 5000 });

  const res = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${exp.expense.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${member.token}` },
  });
  assert.equal(res.status, 400);
  const errData = await res.json();
  assert.equal(errData.error.code, 'APPROVAL_RULE_NOT_FOUND');
});

test('17–20. Rejection workflow: pending expense rejection and budget exclusion', async () => {
  const payer = await registerAndLogin('payer17', 'Payer Seventeen');
  const member = await registerAndLogin('member17', 'Member Seventeen');

  const { trip } = await createTrip(payer.token, { verificationMode: 'member_approval' });
  await joinTrip(member.token, trip.join_code);

  const { data: exp } = await createExpense(payer.token, trip.id, { amountMinor: 25000 });

  // Reject the expense
  const rejRes = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${exp.expense.id}/reject`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${member.token}`,
    },
    body: JSON.stringify({ reason: 'Duplicate entry' }),
  });
  assert.equal(rejRes.status, 200);
  const rejData = await rejRes.json();
  assert.equal(rejData.expense.status, 'rejected');

  // Attempting to approve a rejected expense should fail (409)
  const appRes = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${exp.expense.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${member.token}` },
  });
  assert.equal(appRes.status, 409);

  // Confirm rejected expense does NOT count toward budget total
  const budgetRes = await fetch(`${baseUrl}/api/trips/${trip.id}/budget`, {
    headers: { Authorization: `Bearer ${payer.token}` },
  });
  const budgetData = await budgetRes.json();
  assert.equal(budgetData.totalVerifiedMinor, 0);
});

test('21–24. GET verification details endpoint returns complete history & user state', async () => {
  const payer = await registerAndLogin('payer21', 'Payer TwentyOne');
  const approver1 = await registerAndLogin('approver21_1', 'Approver 21.1');
  const member2 = await registerAndLogin('member21_2', 'Member 21.2');

  const { trip } = await createTrip(payer.token);
  await joinTrip(approver1.token, trip.join_code);
  await joinTrip(member2.token, trip.join_code);

  await insertApprovalRule(pool, {
    tripId: trip.id,
    minAmountMinor: 0,
    maxAmountMinor: null,
    requiredApprovals: 2,
  });

  const { data: exp } = await createExpense(payer.token, trip.id);

  // Approver 1 approves
  await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${exp.expense.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${approver1.token}` },
  });

  // Query verification as approver1
  const ver1 = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${exp.expense.id}/verification`, {
    headers: { Authorization: `Bearer ${approver1.token}` },
  });
  assert.equal(ver1.status, 200);
  const data1 = await ver1.json();
  assert.equal(data1.status, 'pending');
  assert.equal(data1.approvalsRequired, 2);
  assert.equal(data1.approvalsReceived, 1);
  assert.equal(data1.approvalsRemaining, 1);
  assert.equal(data1.currentUserApproved, true);

  // Query verification as member2 (has not approved yet)
  const ver2 = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${exp.expense.id}/verification`, {
    headers: { Authorization: `Bearer ${member2.token}` },
  });
  const data2 = await ver2.json();
  assert.equal(data2.currentUserApproved, false);
});

test('25–28. State safety & clearing approvals when editing pending expense', async () => {
  const payer = await registerAndLogin('payer25', 'Payer TwentyFive');
  const approver = await registerAndLogin('approver25', 'Approver TwentyFive');
  const approver2 = await registerAndLogin('approver25_2', 'Approver TwentyFive Two');

  const { trip } = await createTrip(payer.token);
  await joinTrip(approver.token, trip.join_code);
  await joinTrip(approver2.token, trip.join_code);

  await insertApprovalRule(pool, {
    tripId: trip.id,
    minAmountMinor: 0,
    maxAmountMinor: null,
    requiredApprovals: 2,
  });

  const { data: exp } = await createExpense(payer.token, trip.id);

  // Approver approves -> 1 approval recorded
  await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${exp.expense.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${approver.token}` },
  });

  const verBeforeEdit = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${exp.expense.id}/verification`, {
    headers: { Authorization: `Bearer ${payer.token}` },
  });
  const dataBefore = await verBeforeEdit.json();
  assert.equal(dataBefore.approvalsReceived, 1);

  // Payer edits the pending expense -> previous approvals should be cleared!
  const editRes = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${exp.expense.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${payer.token}`,
    },
    body: JSON.stringify({ amountMinor: 4000 }),
  });
  assert.equal(editRes.status, 200);

  const verAfterEdit = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${exp.expense.id}/verification`, {
    headers: { Authorization: `Bearer ${payer.token}` },
  });
  const dataAfter = await verAfterEdit.json();
  assert.equal(dataAfter.approvalsReceived, 0);
});

test('29–32. Security checks (unauthorized requests, invalid tokens)', async () => {
  const payer = await registerAndLogin('payer29', 'Payer TwentyNine');
  const { trip } = await createTrip(payer.token);
  const { data: exp } = await createExpense(payer.token, trip.id);

  // Request without auth token -> 401
  const noAuthRes = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${exp.expense.id}/approve`, {
    method: 'POST',
  });
  assert.equal(noAuthRes.status, 401);
});

test('33–34. Concurrency: simultaneous approvals do not produce duplicate records or incorrect counts', async () => {
  const payer = await registerAndLogin('payer33', 'Payer ThirtyThree');
  const approver = await registerAndLogin('approver33', 'Approver ThirtyThree');

  const { trip } = await createTrip(payer.token);
  await joinTrip(approver.token, trip.join_code);

  const { data: exp } = await createExpense(payer.token, trip.id);

  // Trigger two simultaneous approve requests from the same user
  const [res1, res2] = await Promise.all([
    fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${exp.expense.id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${approver.token}` },
    }),
    fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${exp.expense.id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${approver.token}` },
    }),
  ]);

  const statuses = [res1.status, res2.status].sort();
  // Exactly one request should succeed (200) and the duplicate should fail (409)
  assert.deepEqual(statuses, [200, 409]);
});

// ---------------------------------------------------------------------------
// Phase 5 corrections: reject-after-approve audit fix, self-rejection,
// and the new approval-rules configuration API.
// ---------------------------------------------------------------------------

async function createApprovalRuleViaApi(token, tripId, body) {
  const res = await fetch(`${baseUrl}/api/trips/${tripId}/approval-rules`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

test('35. Reject-after-approve leaves an accurate audit record (bug fix)', async () => {
  const payer = await registerAndLogin('payer35', 'Payer ThirtyFive');
  const memberA = await registerAndLogin('memberA35', 'Member A ThirtyFive');
  const memberB = await registerAndLogin('memberB35', 'Member B ThirtyFive');

  const { trip } = await createTrip(payer.token, { verificationMode: 'member_approval' });
  await joinTrip(memberA.token, trip.join_code);
  await joinTrip(memberB.token, trip.join_code);

  await insertApprovalRule(pool, {
    tripId: trip.id,
    minAmountMinor: 0,
    maxAmountMinor: null,
    requiredApprovals: 2,
  });

  const { data: exp } = await createExpense(payer.token, trip.id);
  const expenseId = exp.expense.id;

  // Member B approves first -> expense stays pending (1 of 2 required).
  const approveRes = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${expenseId}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memberB.token}` },
  });
  assert.equal(approveRes.status, 200);
  const approveData = await approveRes.json();
  assert.equal(approveData.expense.status, 'pending');
  assert.equal(approveData.verification.approvalsReceived, 1);

  // Member B now rejects the same expense.
  const rejectRes = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${expenseId}/reject`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${memberB.token}`,
    },
    body: JSON.stringify({ reason: 'Changed my mind' }),
  });
  assert.equal(rejectRes.status, 200);
  const rejectData = await rejectRes.json();
  assert.equal(rejectData.expense.status, 'rejected');

  // The underlying expense_approvals row for Member B must now say
  // 'rejected', not remain stuck at 'approved' (this is the bug fix).
  const dbRow = await pool.query(
    `SELECT decision FROM expense_approvals WHERE expense_id = $1 AND approved_by_member_id = $2`,
    [expenseId, (await pool.query('SELECT id FROM trip_members WHERE trip_id = $1 AND user_id = $2', [trip.id, memberB.user.id])).rows[0].id]
  );
  assert.equal(dbRow.rows.length, 1, 'exactly one approval row for Member B (no duplicate via UNIQUE constraint)');
  assert.equal(dbRow.rows[0].decision, 'rejected');

  // The verification endpoint must also reflect the corrected decision:
  // Member B should no longer count as having approved.
  const verRes = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${expenseId}/verification`, {
    headers: { Authorization: `Bearer ${payer.token}` },
  });
  const verData = await verRes.json();
  assert.equal(verData.approvalsReceived, 0);
  assert.equal(verData.approvedBy.some((a) => a.displayName === 'Member B ThirtyFive'), false);
});

test('36. Payer can reject their own pending expense', async () => {
  const payer = await registerAndLogin('payer36', 'Payer ThirtySix');
  const member = await registerAndLogin('member36', 'Member ThirtySix');

  const { trip } = await createTrip(payer.token, { verificationMode: 'member_approval' });
  await joinTrip(member.token, trip.join_code);

  const { data: exp } = await createExpense(payer.token, trip.id);

  const rejectRes = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${exp.expense.id}/reject`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${payer.token}`,
    },
    body: JSON.stringify({ reason: 'Submitted by mistake' }),
  });
  assert.equal(rejectRes.status, 200);
  const rejectData = await rejectRes.json();
  assert.equal(rejectData.expense.status, 'rejected');
});

test('37. Owner can create a valid approval rule', async () => {
  const owner = await registerAndLogin('owner37', 'Owner ThirtySeven');
  const member = await registerAndLogin('member37', 'Member ThirtySeven');
  const { trip } = await createTrip(owner.token, { verificationMode: 'tiered' });
  await joinTrip(member.token, trip.join_code);

  const { status, data } = await createApprovalRuleViaApi(owner.token, trip.id, {
    minAmountMinor: 0,
    maxAmountMinor: 10000,
    requiredApprovals: 1,
  });
  assert.equal(status, 201);
  assert.equal(data.rule.min_amount_minor, '0');
  assert.equal(data.rule.max_amount_minor, '10000');
  assert.equal(data.rule.required_approvals, 1);
});

test('38. Approval rule creation rejects maxAmountMinor < minAmountMinor', async () => {
  const owner = await registerAndLogin('owner38', 'Owner ThirtyEight');
  const member = await registerAndLogin('member38', 'Member ThirtyEight');
  const { trip } = await createTrip(owner.token, { verificationMode: 'tiered' });
  await joinTrip(member.token, trip.join_code);

  const { status, data } = await createApprovalRuleViaApi(owner.token, trip.id, {
    minAmountMinor: 10000,
    maxAmountMinor: 5000,
    requiredApprovals: 1,
  });
  assert.equal(status, 422);
  assert.equal(data.error.code, 'VALIDATION_ERROR');
});

test('39. Approval rule creation rejects a non-positive requiredApprovals', async () => {
  const owner = await registerAndLogin('owner39', 'Owner ThirtyNine');
  const { trip } = await createTrip(owner.token, { verificationMode: 'tiered' });

  const { status, data } = await createApprovalRuleViaApi(owner.token, trip.id, {
    minAmountMinor: 0,
    maxAmountMinor: 10000,
    requiredApprovals: 0,
  });
  assert.equal(status, 422);
  assert.equal(data.error.code, 'VALIDATION_ERROR');
});

test('40. Non-owner/admin member cannot create an approval rule (FORBIDDEN)', async () => {
  const owner = await registerAndLogin('owner40', 'Owner Forty');
  const member = await registerAndLogin('member40', 'Member Forty');
  const { trip } = await createTrip(owner.token, { verificationMode: 'tiered' });
  await joinTrip(member.token, trip.join_code);

  const { status, data } = await createApprovalRuleViaApi(member.token, trip.id, {
    minAmountMinor: 0,
    maxAmountMinor: 10000,
    requiredApprovals: 1,
  });
  assert.equal(status, 403);
  assert.equal(data.error.code, 'FORBIDDEN');
});

test('41. Cross-trip approval rule creation is rejected (404 non-leaking)', async () => {
  const ownerA = await registerAndLogin('ownerA41', 'Owner A FortyOne');
  const ownerB = await registerAndLogin('ownerB41', 'Owner B FortyOne');
  const { trip: tripB } = await createTrip(ownerB.token, { verificationMode: 'tiered' });

  // ownerA is not a member of tripB at all -> requireTripMembership 404s
  // before the rule-creation logic ever runs.
  const { status } = await createApprovalRuleViaApi(ownerA.token, tripB.id, {
    minAmountMinor: 0,
    maxAmountMinor: 10000,
    requiredApprovals: 1,
  });
  assert.equal(status, 404);
});

test('42. Overlapping approval rules are rejected (409 APPROVAL_RULE_OVERLAP)', async () => {
  const owner = await registerAndLogin('owner42', 'Owner FortyTwo');
  const member1 = await registerAndLogin('member42_1', 'Member FortyTwo 1');
  const member2 = await registerAndLogin('member42_2', 'Member FortyTwo 2');
  const member3 = await registerAndLogin('member42_3', 'Member FortyTwo 3');
  const { trip } = await createTrip(owner.token, { verificationMode: 'tiered' });
  await joinTrip(member1.token, trip.join_code);
  await joinTrip(member2.token, trip.join_code);
  await joinTrip(member3.token, trip.join_code);

  const first = await createApprovalRuleViaApi(owner.token, trip.id, {
    minAmountMinor: 0,
    maxAmountMinor: 10000,
    requiredApprovals: 1,
  });
  assert.equal(first.status, 201);

  // Overlaps [0, 10000] at 5000.
  const overlapping = await createApprovalRuleViaApi(owner.token, trip.id, {
    minAmountMinor: 5000,
    maxAmountMinor: 20000,
    requiredApprovals: 2,
  });
  assert.equal(overlapping.status, 409);
  assert.equal(overlapping.data.error.code, 'APPROVAL_RULE_OVERLAP');

  // Non-overlapping tier above the first is fine.
  const nonOverlapping = await createApprovalRuleViaApi(owner.token, trip.id, {
    minAmountMinor: 10001,
    maxAmountMinor: null,
    requiredApprovals: 3,
  });
  assert.equal(nonOverlapping.status, 201);
});

test('43. Tiered mode: rule created via API is correctly applied end-to-end', async () => {
  const payer = await registerAndLogin('payer43', 'Payer FortyThree');
  const approver1 = await registerAndLogin('approver43_1', 'Approver 43.1');
  const approver2 = await registerAndLogin('approver43_2', 'Approver 43.2');

  const { trip } = await createTrip(payer.token, { verificationMode: 'tiered' });
  await joinTrip(approver1.token, trip.join_code);
  await joinTrip(approver2.token, trip.join_code);

  const ruleRes = await createApprovalRuleViaApi(payer.token, trip.id, {
    minAmountMinor: 20000,
    maxAmountMinor: null,
    requiredApprovals: 2,
  });
  assert.equal(ruleRes.status, 201);

  const { data: exp } = await createExpense(payer.token, trip.id, { amountMinor: 25000 });
  const expenseId = exp.expense.id;
  assert.equal(exp.expense.status, 'pending');

  // First approval -> still pending (1 of 2 required).
  const approve1 = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${expenseId}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${approver1.token}` },
  });
  const approve1Data = await approve1.json();
  assert.equal(approve1Data.expense.status, 'pending');
  assert.equal(approve1Data.verification.approvalsRequired, 2);

  // Second approval -> now verified.
  const approve2 = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${expenseId}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${approver2.token}` },
  });
  const approve2Data = await approve2.json();
  assert.equal(approve2Data.expense.status, 'verified');
});

test('44. Tiered mode: expense amount outside any configured rule fails safe (APPROVAL_RULE_NOT_FOUND)', async () => {
  const payer = await registerAndLogin('payer44', 'Payer FortyFour');
  const approver = await registerAndLogin('approver44', 'Approver FortyFour');

  const { trip } = await createTrip(payer.token, { verificationMode: 'tiered' });
  await joinTrip(approver.token, trip.join_code);

  // Rule only covers [0, 5000]; the expense below is well outside it.
  await createApprovalRuleViaApi(payer.token, trip.id, {
    minAmountMinor: 0,
    maxAmountMinor: 5000,
    requiredApprovals: 1,
  });

  const { data: exp } = await createExpense(payer.token, trip.id, { amountMinor: 99999 });

  const approveRes = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${exp.expense.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${approver.token}` },
  });
  assert.equal(approveRes.status, 400);
  const approveData = await approveRes.json();
  assert.equal(approveData.error.code, 'APPROVAL_RULE_NOT_FOUND');
});

test('45. GET approval-rules lists configured rules for the trip', async () => {
  const owner = await registerAndLogin('owner45', 'Owner FortyFive');
  const member1 = await registerAndLogin('member45_1', 'Member FortyFive 1');
  const member2 = await registerAndLogin('member45_2', 'Member FortyFive 2');
  const member3 = await registerAndLogin('member45_3', 'Member FortyFive 3');
  const { trip } = await createTrip(owner.token, { verificationMode: 'tiered' });
  await joinTrip(member1.token, trip.join_code);
  await joinTrip(member2.token, trip.join_code);
  await joinTrip(member3.token, trip.join_code);

  await createApprovalRuleViaApi(owner.token, trip.id, {
    minAmountMinor: 0,
    maxAmountMinor: 10000,
    requiredApprovals: 1,
  });
  await createApprovalRuleViaApi(owner.token, trip.id, {
    minAmountMinor: 10001,
    maxAmountMinor: null,
    requiredApprovals: 3,
  });

  const listRes = await fetch(`${baseUrl}/api/trips/${trip.id}/approval-rules`, {
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  assert.equal(listRes.status, 200);
  const listData = await listRes.json();
  assert.equal(listData.rules.length, 2);
  assert.equal(listData.rules[0].min_amount_minor, '0');
  assert.equal(listData.rules[1].min_amount_minor, '10001');
});

// Phase 9.4 coverage gap fix: the suite above never combined budgetType
// "unlimited" (Phase 9.3.1) with member_approval or tiered verification.
// calculateRequiredApprovals only ever reads the expense's own amountMinor
// against approval_rules and never touches budget_amount_minor (see
// ExpenseApprovalService.js), so this is expected to behave identically to
// the fixed_total case above - these tests lock that in.

test('46. Unlimited budget + member_approval: approval flow works and budget stays unlimited throughout', async () => {
  const payer = await registerAndLogin('payer46', 'Payer FortySix');
  const approver = await registerAndLogin('approver46', 'Approver FortySix');

  const { trip } = await createTrip(payer.token, {
    budgetType: 'unlimited',
    budgetAmountMinor: undefined,
    verificationMode: 'member_approval',
  });
  assert.equal(trip.budget_type, 'unlimited');
  assert.equal(trip.budget_amount_minor, null);

  await joinTrip(approver.token, trip.join_code);

  // Budget before any expense: still unlimited, zero spent, no limit fields.
  const beforeRes = await fetch(`${baseUrl}/api/trips/${trip.id}/budget`, {
    headers: { Authorization: `Bearer ${payer.token}` },
  });
  const beforeBody = await beforeRes.json();
  assert.equal(beforeBody.budgetType, 'unlimited');
  assert.equal(beforeBody.totalVerifiedMinor, 0);
  assert.equal('budgetAmountMinor' in beforeBody, false);
  assert.equal('percentageUsed' in beforeBody, false);
  assert.equal('status' in beforeBody, false);

  const { data: exp } = await createExpense(payer.token, trip.id, { amountMinor: 7500 });
  assert.equal(exp.expense.status, 'pending');

  // No approval rule configured -> member_approval defaults to 1 required.
  const detailsRes = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${exp.expense.id}/verification`, {
    headers: { Authorization: `Bearer ${payer.token}` },
  });
  const details = await detailsRes.json();
  assert.equal(details.approvalsRequired, 1);
  assert.equal(details.approvalsReceived, 0);
  assert.equal(details.approvalsRemaining, 1);

  const approveRes = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${exp.expense.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${approver.token}` },
  });
  const approveData = await approveRes.json();
  assert.equal(approveData.expense.status, 'verified');
  assert.equal(approveData.verification.approvalsReceived, 1);
  assert.equal(approveData.verification.approvalsRemaining, 0);

  // Budget after verification: total reflects the expense, still no ceiling
  // and no percentage/NaN/Infinity of any kind.
  const afterRes = await fetch(`${baseUrl}/api/trips/${trip.id}/budget`, {
    headers: { Authorization: `Bearer ${payer.token}` },
  });
  const afterBody = await afterRes.json();
  assert.equal(afterBody.budgetType, 'unlimited');
  assert.equal(afterBody.totalVerifiedMinor, 7500);
  assert.equal('budgetAmountMinor' in afterBody, false);
  assert.equal('percentageUsed' in afterBody, false);
  assert.equal(Number.isFinite(afterBody.totalVerifiedMinor), true);
});

test('47. Unlimited budget + tiered: correct tier is selected, verifies at threshold, budget stays unlimited', async () => {
  const payer = await registerAndLogin('payer47', 'Payer FortySeven');
  const member1 = await registerAndLogin('member47_1', 'Member 47.1');
  const member2 = await registerAndLogin('member47_2', 'Member 47.2');

  const { trip } = await createTrip(payer.token, {
    budgetType: 'unlimited',
    budgetAmountMinor: undefined,
    verificationMode: 'tiered',
  });
  assert.equal(trip.budget_type, 'unlimited');
  assert.equal(trip.budget_amount_minor, null);

  await joinTrip(member1.token, trip.join_code);
  await joinTrip(member2.token, trip.join_code);

  // A single tier covering the expense amount, requiring 2 approvals.
  await insertApprovalRule(pool, {
    tripId: trip.id,
    minAmountMinor: 0,
    maxAmountMinor: null,
    requiredApprovals: 2,
  });

  const { data: exp } = await createExpense(payer.token, trip.id, { amountMinor: 12000 });
  assert.equal(exp.expense.status, 'pending');

  const detailsRes = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${exp.expense.id}/verification`, {
    headers: { Authorization: `Bearer ${payer.token}` },
  });
  const details = await detailsRes.json();
  assert.equal(details.approvalsRequired, 2, 'the configured tier, not a budget-derived value, should apply');

  const approve1Res = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${exp.expense.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${member1.token}` },
  });
  const approve1Data = await approve1Res.json();
  assert.equal(approve1Data.expense.status, 'pending');

  const approve2Res = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${exp.expense.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${member2.token}` },
  });
  const approve2Data = await approve2Res.json();
  assert.equal(approve2Data.expense.status, 'verified');

  const budgetRes = await fetch(`${baseUrl}/api/trips/${trip.id}/budget`, {
    headers: { Authorization: `Bearer ${payer.token}` },
  });
  const budgetBody = await budgetRes.json();
  assert.equal(budgetBody.budgetType, 'unlimited');
  assert.equal(budgetBody.totalVerifiedMinor, 12000);
  assert.equal('budgetAmountMinor' in budgetBody, false);
  assert.equal('percentageUsed' in budgetBody, false);
  assert.equal(Number.isFinite(budgetBody.totalVerifiedMinor), true);
});
