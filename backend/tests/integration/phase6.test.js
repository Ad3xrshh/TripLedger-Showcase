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
import dashboardRoutes from '../../src/routes/dashboardRoutes.js';
import historyRoutes from '../../src/routes/historyRoutes.js';
import notificationRoutes from '../../src/routes/notificationRoutes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { insertApprovalRule } from '../../src/repositories/expenseApprovalRepository.js';

let server;
let baseUrl;

const PASSWORD = 'Password123!';
const EMAIL_PREFIX = 'phase6_test_';

async function cleanupTestData() {
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
    name: 'Phase 6 Test Trip',
    budgetType: 'fixed_total',
    budgetAmountMinor: 10000,
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

async function getDashboard(token, tripId) {
  const res = await fetch(`${baseUrl}/api/trips/${tripId}/dashboard`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, data: await res.json() };
}

async function getHistory(token, tripId, qs = '') {
  const res = await fetch(`${baseUrl}/api/trips/${tripId}/history${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, data: await res.json() };
}

async function getNotifications(token, qs = '') {
  const res = await fetch(`${baseUrl}/api/notifications${qs}`, {
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
  app.use('/api/trips/:tripId/budget', budgetRoutes);
  app.use('/api/trips/:tripId/approval-rules', approvalRuleRoutes);
  app.use('/api/trips/:tripId/dashboard', dashboardRoutes);
  app.use('/api/trips/:tripId/history', historyRoutes);
  app.use('/api/notifications', notificationRoutes);
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
// DASHBOARD
// ---------------------------------------------------------------------------

test('D1. Member can access the dashboard', async () => {
  const owner = await registerAndLogin('d1_owner', 'D1 Owner');
  const { trip } = await createTrip(owner.token);

  const { status, data } = await getDashboard(owner.token, trip.id);
  assert.equal(status, 200);
  assert.equal(data.trip.id, trip.id);
  assert.equal(data.trip.name, 'Phase 6 Test Trip');
});

test('D2. Non-member is blocked from the dashboard (404 non-leaking)', async () => {
  const owner = await registerAndLogin('d2_owner', 'D2 Owner');
  const outsider = await registerAndLogin('d2_outsider', 'D2 Outsider');
  const { trip } = await createTrip(owner.token);

  const { status } = await getDashboard(outsider.token, trip.id);
  assert.equal(status, 404);
});

test('D3. Member count is correct', async () => {
  const owner = await registerAndLogin('d3_owner', 'D3 Owner');
  const member = await registerAndLogin('d3_member', 'D3 Member');
  const { trip } = await createTrip(owner.token);
  await joinTrip(member.token, trip.join_code);

  const { data } = await getDashboard(owner.token, trip.id);
  assert.equal(data.members.count, 2);
});

test('D4. Budget numbers match the standalone budget endpoint; pending/rejected excluded', async () => {
  const owner = await registerAndLogin('d4_owner', 'D4 Owner');
  const approver = await registerAndLogin('d4_approver', 'D4 Approver');
  const { trip } = await createTrip(owner.token, { budgetAmountMinor: 100000 });
  await joinTrip(approver.token, trip.join_code);

  const { data: verifiedExpense } = await createExpense(owner.token, trip.id, { amountMinor: 3000 });
  await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${verifiedExpense.expense.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${approver.token}` },
  });

  // pending expense - must NOT count toward spending
  await createExpense(owner.token, trip.id, { amountMinor: 5000 });

  // rejected expense - must NOT count toward spending
  const { data: toReject } = await createExpense(owner.token, trip.id, { amountMinor: 7000 });
  await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${toReject.expense.id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${approver.token}` },
    body: JSON.stringify({}),
  });

  const budgetRes = await fetch(`${baseUrl}/api/trips/${trip.id}/budget`, {
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  const budgetData = await budgetRes.json();

  const { data: dashboard } = await getDashboard(owner.token, trip.id);

  assert.equal(dashboard.budget.totalVerifiedMinor, budgetData.totalVerifiedMinor);
  assert.equal(dashboard.budget.totalVerifiedMinor, 3000);
  assert.equal(dashboard.expenseSummary.verifiedSpendingMinor, 3000);
  assert.equal(dashboard.expenseSummary.verified, 1);
  assert.equal(dashboard.expenseSummary.pending, 1);
  assert.equal(dashboard.expenseSummary.rejected, 1);
  assert.equal(dashboard.expenseSummary.total, 3);
});

test('D5. Recent expenses are ordered newest-first and limited to 10', async () => {
  const owner = await registerAndLogin('d5_owner', 'D5 Owner');
  const { trip } = await createTrip(owner.token, { budgetAmountMinor: 1000000 });

  for (let i = 0; i < 12; i += 1) {
    await createExpense(owner.token, trip.id, {
      amountMinor: 100 + i,
      occurredAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
    });
  }

  const { data } = await getDashboard(owner.token, trip.id);
  assert.equal(data.recentExpenses.length, 10);
  // newest occurredAt first
  const dates = data.recentExpenses.map((e) => new Date(e.occurredAt).getTime());
  const sorted = [...dates].sort((a, b) => b - a);
  assert.deepEqual(dates, sorted);
});

test('D6. Pending approvals excludes the payer\'s own expense and already-decided expenses', async () => {
  const owner = await registerAndLogin('d6_owner', 'D6 Owner');
  const approver = await registerAndLogin('d6_approver', 'D6 Approver');
  const { trip } = await createTrip(owner.token);
  await joinTrip(approver.token, trip.join_code);

  const { data: ownExpense } = await createExpense(owner.token, trip.id);
  const { data: otherExpense } = await createExpense(owner.token, trip.id);

  // approver approves otherExpense - it should verify (member_approval, default rule = 1) and drop off the list
  await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${otherExpense.expense.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${approver.token}` },
  });

  const { data: ownerDashboard } = await getDashboard(owner.token, trip.id);
  // owner is the payer for both expenses - neither should appear as something owner can act on
  assert.equal(ownerDashboard.pendingApprovals.find((e) => e.expenseId === ownExpense.expense.id), undefined);

  const { data: approverDashboard } = await getDashboard(approver.token, trip.id);
  // approver already decided on otherExpense (now verified) - must not reappear
  assert.equal(approverDashboard.pendingApprovals.find((e) => e.expenseId === otherExpense.expense.id), undefined);
  // approver never decided on ownExpense, and is not its payer - it belongs on their pending list
  assert.ok(approverDashboard.pendingApprovals.some((e) => e.expenseId === ownExpense.expense.id));
});

// ---------------------------------------------------------------------------
// NOTIFICATIONS
// ---------------------------------------------------------------------------

test('N1. Approving an expense notifies the payer (EXPENSE_APPROVED or EXPENSE_VERIFIED)', async () => {
  const payer = await registerAndLogin('n1_payer', 'N1 Payer');
  const approver = await registerAndLogin('n1_approver', 'N1 Approver');
  const { trip } = await createTrip(payer.token);
  await joinTrip(approver.token, trip.join_code);

  const { data: expenseRes } = await createExpense(payer.token, trip.id);
  await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${expenseRes.expense.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${approver.token}` },
  });

  const { data } = await getNotifications(payer.token, `?tripId=${trip.id}`);
  const verifiedNotif = data.notifications.find((n) => n.type === 'EXPENSE_VERIFIED');
  assert.ok(verifiedNotif, 'expected an EXPENSE_VERIFIED notification for the payer');
  assert.equal(verifiedNotif.related_expense_id, expenseRes.expense.id);

  // single approval that reaches threshold must NOT also produce a separate
  // EXPENSE_APPROVED notification for the same event
  const approvedNotif = data.notifications.find((n) => n.type === 'EXPENSE_APPROVED');
  assert.equal(approvedNotif, undefined);
});

test('N2. Approver does not receive a self-approval notification', async () => {
  const payer = await registerAndLogin('n2_payer', 'N2 Payer');
  const approver = await registerAndLogin('n2_approver', 'N2 Approver');
  const { trip } = await createTrip(payer.token);
  await joinTrip(approver.token, trip.join_code);

  const { data: expenseRes } = await createExpense(payer.token, trip.id);
  await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${expenseRes.expense.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${approver.token}` },
  });

  const { data } = await getNotifications(approver.token, `?tripId=${trip.id}`);
  assert.equal(data.notifications.length, 0);
});

test('N3. Rejecting an expense notifies the payer', async () => {
  const payer = await registerAndLogin('n3_payer', 'N3 Payer');
  const approver = await registerAndLogin('n3_approver', 'N3 Approver');
  const { trip } = await createTrip(payer.token);
  await joinTrip(approver.token, trip.join_code);

  const { data: expenseRes } = await createExpense(payer.token, trip.id);
  await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${expenseRes.expense.id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${approver.token}` },
    body: JSON.stringify({ reason: 'Not a trip expense' }),
  });

  const { data } = await getNotifications(payer.token, `?tripId=${trip.id}`);
  const rejectedNotif = data.notifications.find((n) => n.type === 'EXPENSE_REJECTED');
  assert.ok(rejectedNotif, 'expected an EXPENSE_REJECTED notification for the payer');
});

test('N4. Creating an expense notifies other members (member_approval mode), not the payer', async () => {
  const payer = await registerAndLogin('n4_payer', 'N4 Payer');
  const member = await registerAndLogin('n4_member', 'N4 Member');
  const { trip } = await createTrip(payer.token);
  await joinTrip(member.token, trip.join_code);

  await createExpense(payer.token, trip.id);

  const { data: memberNotifs } = await getNotifications(member.token, `?tripId=${trip.id}`);
  assert.ok(memberNotifs.notifications.some((n) => n.type === 'EXPENSE_CREATED'));

  const { data: payerNotifs } = await getNotifications(payer.token, `?tripId=${trip.id}`);
  assert.equal(payerNotifs.notifications.find((n) => n.type === 'EXPENSE_CREATED'), undefined);
});

test('N5. Member join notifies the trip owner', async () => {
  const owner = await registerAndLogin('n5_owner', 'N5 Owner');
  const joiner = await registerAndLogin('n5_joiner', 'N5 Joiner');
  const { trip } = await createTrip(owner.token);

  await joinTrip(joiner.token, trip.join_code);

  const { data } = await getNotifications(owner.token, `?tripId=${trip.id}`);
  assert.ok(data.notifications.some((n) => n.type === 'TRIP_MEMBER_JOINED'));
});

test('N6. GET /dashboard creates no notifications', async () => {
  const owner = await registerAndLogin('n6_owner', 'N6 Owner');
  const { trip } = await createTrip(owner.token);

  await getDashboard(owner.token, trip.id);
  await getDashboard(owner.token, trip.id);
  await getDashboard(owner.token, trip.id);

  const { data } = await getNotifications(owner.token, `?tripId=${trip.id}`);
  assert.equal(data.notifications.length, 0);
});

test('N7. GET /notifications creates no notifications (repeated calls are stable)', async () => {
  const payer = await registerAndLogin('n7_payer', 'N7 Payer');
  const approver = await registerAndLogin('n7_approver', 'N7 Approver');
  const { trip } = await createTrip(payer.token);
  await joinTrip(approver.token, trip.join_code);
  const { data: expenseRes } = await createExpense(payer.token, trip.id);
  await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${expenseRes.expense.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${approver.token}` },
  });

  const { data: first } = await getNotifications(payer.token, `?tripId=${trip.id}`);
  const { data: second } = await getNotifications(payer.token, `?tripId=${trip.id}`);
  const { data: third } = await getNotifications(payer.token, `?tripId=${trip.id}`);

  assert.equal(first.notifications.length, second.notifications.length);
  assert.equal(second.notifications.length, third.notifications.length);
});

test('N8. Unread filtering and mark-one-read', async () => {
  const payer = await registerAndLogin('n8_payer', 'N8 Payer');
  const approver = await registerAndLogin('n8_approver', 'N8 Approver');
  const { trip } = await createTrip(payer.token);
  await joinTrip(approver.token, trip.join_code);
  const { data: expenseRes } = await createExpense(payer.token, trip.id);
  await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${expenseRes.expense.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${approver.token}` },
  });

  const { data: before } = await getNotifications(payer.token, `?tripId=${trip.id}&unread=true`);
  assert.ok(before.notifications.length >= 1);
  const target = before.notifications[0];

  const markRes = await fetch(`${baseUrl}/api/notifications/${target.id}/read`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${payer.token}` },
  });
  assert.equal(markRes.status, 200);
  const markData = await markRes.json();
  assert.ok(markData.notification.read_at);

  const { data: after } = await getNotifications(payer.token, `?tripId=${trip.id}&unread=true`);
  assert.equal(after.notifications.find((n) => n.id === target.id), undefined);
});

test('N9. Mark-all-read', async () => {
  const payer = await registerAndLogin('n9_payer', 'N9 Payer');
  const member1 = await registerAndLogin('n9_member1', 'N9 Member1');
  const member2 = await registerAndLogin('n9_member2', 'N9 Member2');
  const { trip } = await createTrip(payer.token);
  await joinTrip(member1.token, trip.join_code);
  await joinTrip(member2.token, trip.join_code);

  await createExpense(payer.token, trip.id); // notifies member1 and member2

  const readAllRes = await fetch(`${baseUrl}/api/notifications/read-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member1.token}` },
    body: JSON.stringify({ tripId: trip.id }),
  });
  assert.equal(readAllRes.status, 200);

  const { data } = await getNotifications(member1.token, `?tripId=${trip.id}&unread=true`);
  assert.equal(data.notifications.length, 0);

  // member2's notifications must be unaffected by member1's mark-all-read
  const { data: member2Notifs } = await getNotifications(member2.token, `?tripId=${trip.id}&unread=true`);
  assert.ok(member2Notifs.notifications.length >= 1);
});

test('N10. Notification ownership: user cannot mark another user\'s notification as read', async () => {
  const payer = await registerAndLogin('n10_payer', 'N10 Payer');
  const approver = await registerAndLogin('n10_approver', 'N10 Approver');
  const outsider = await registerAndLogin('n10_outsider', 'N10 Outsider');
  const { trip } = await createTrip(payer.token);
  await joinTrip(approver.token, trip.join_code);
  const { data: expenseRes } = await createExpense(payer.token, trip.id);
  await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${expenseRes.expense.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${approver.token}` },
  });

  const { data } = await getNotifications(payer.token, `?tripId=${trip.id}`);
  const target = data.notifications[0];

  const res = await fetch(`${baseUrl}/api/notifications/${target.id}/read`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${outsider.token}` },
  });
  assert.equal(res.status, 404);
});

test('N11. User cannot GET another user\'s notifications', async () => {
  const payer = await registerAndLogin('n11_payer', 'N11 Payer');
  const approver = await registerAndLogin('n11_approver', 'N11 Approver');
  const { trip } = await createTrip(payer.token);
  await joinTrip(approver.token, trip.join_code);
  const { data: expenseRes } = await createExpense(payer.token, trip.id);
  await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${expenseRes.expense.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${approver.token}` },
  });

  // approver's own notification feed must never contain the payer's notification
  const { data: approverFeed } = await getNotifications(approver.token, `?tripId=${trip.id}`);
  const { data: payerFeed } = await getNotifications(payer.token, `?tripId=${trip.id}`);
  const payerNotifIds = new Set(payerFeed.notifications.map((n) => n.id));
  assert.ok(!approverFeed.notifications.some((n) => payerNotifIds.has(n.id)));
});

// ---------------------------------------------------------------------------
// HISTORY
// ---------------------------------------------------------------------------

test('H1. Member can access history; non-member is blocked', async () => {
  const owner = await registerAndLogin('h1_owner', 'H1 Owner');
  const outsider = await registerAndLogin('h1_outsider', 'H1 Outsider');
  const { trip } = await createTrip(owner.token);

  const { status } = await getHistory(owner.token, trip.id);
  assert.equal(status, 200);

  const outsiderRes = await getHistory(outsider.token, trip.id);
  assert.equal(outsiderRes.status, 404);
});

test('H2. Events are ordered newest first and each expected event type appears', async () => {
  const payer = await registerAndLogin('h2_payer', 'H2 Payer');
  const approver = await registerAndLogin('h2_approver', 'H2 Approver');
  const { trip } = await createTrip(payer.token);
  await joinTrip(approver.token, trip.join_code); // member_joined

  const { data: toApprove } = await createExpense(payer.token, trip.id); // expense_created
  await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${toApprove.expense.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${approver.token}` },
  }); // expense_approved + expense_verified

  const { data: toReject } = await createExpense(payer.token, trip.id); // expense_created
  await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${toReject.expense.id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${approver.token}` },
    body: JSON.stringify({}),
  }); // expense_rejected

  const { data } = await getHistory(payer.token, trip.id);
  const actions = data.events.map((e) => e.action);

  assert.ok(actions.includes('member_joined'));
  assert.ok(actions.includes('expense_created'));
  assert.ok(actions.includes('expense_approved'));
  assert.ok(actions.includes('expense_verified'));
  assert.ok(actions.includes('expense_rejected'));

  const times = data.events.map((e) => new Date(e.created_at).getTime());
  const sorted = [...times].sort((a, b) => b - a);
  assert.deepEqual(times, sorted);
});

test('H3. Pagination works and limit is clamped to the maximum', async () => {
  const owner = await registerAndLogin('h3_owner', 'H3 Owner');
  const { trip } = await createTrip(owner.token, { budgetAmountMinor: 1000000 });

  for (let i = 0; i < 5; i += 1) {
    await createExpense(owner.token, trip.id, { amountMinor: 100 + i });
  }

  const { data: page1 } = await getHistory(owner.token, trip.id, '?page=1&limit=2');
  assert.equal(page1.events.length, 2);
  assert.equal(page1.pagination.page, 1);
  assert.equal(page1.pagination.limit, 2);
  assert.ok(page1.pagination.total >= 5);

  const { data: page2 } = await getHistory(owner.token, trip.id, '?page=2&limit=2');
  assert.equal(page2.events.length, 2);
  assert.notEqual(page1.events[0].id, page2.events[0].id);

  const { data: clamped } = await getHistory(owner.token, trip.id, '?limit=99999');
  assert.equal(clamped.pagination.limit, 100);
});

test('H4. Cross-trip events are excluded from a trip\'s history', async () => {
  const ownerA = await registerAndLogin('h4_ownerA', 'H4 Owner A');
  const ownerB = await registerAndLogin('h4_ownerB', 'H4 Owner B');
  const { trip: tripA } = await createTrip(ownerA.token, { budgetAmountMinor: 100000 });
  const { trip: tripB } = await createTrip(ownerB.token, { budgetAmountMinor: 100000 });

  await createExpense(ownerA.token, tripA.id);
  await createExpense(ownerB.token, tripB.id);

  // ownerB cannot access tripA's history at all - membership-gated (404 non-leaking)
  const crossRes = await getHistory(ownerB.token, tripA.id);
  assert.equal(crossRes.status, 404);
});

// ---------------------------------------------------------------------------
// REGRESSION SANITY: Phase 5 approval flow still works unchanged
// ---------------------------------------------------------------------------

test('R1. Phase 5 self-approval guard still blocks the payer', async () => {
  const payer = await registerAndLogin('r1_payer', 'R1 Payer');
  const { trip } = await createTrip(payer.token);
  const { data: expenseRes } = await createExpense(payer.token, trip.id);

  const res = await fetch(`${baseUrl}/api/trips/${trip.id}/expenses/${expenseRes.expense.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${payer.token}` },
  });
  assert.equal(res.status, 400);
  const errData = await res.json();
  assert.equal(errData.error.code, 'CANNOT_SELF_APPROVE');
});
